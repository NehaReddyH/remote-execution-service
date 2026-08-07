const express = require("express");
const { Client } = require("ssh2");
const app = express();

app.use(express.json());

// API Key authentication middleware
app.use((req, res, next) => {
  const token = req.headers["x-api-key"];
  if (token !== process.env.API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

// SSH execute endpoint
app.post("/api/execute", (req, res) => {
  const { server, username, password, command, port = 22 } = req.body;

  // Validate required fields
  if (!server || !username || !password || !command) {
    return res.status(400).json({
      error: "Missing required fields: server, username, password, command"
    });
  }

  // Validate port
  if (typeof port !== "number" || port < 1 || port > 65535) {
    return res.status(400).json({
      error: "Invalid port number"
    });
  }

  const conn = new Client();
  let stdout = "";
  let stderr = "";
  let responseSent = false;

  // Set timeout
  const timeout = setTimeout(() => {
    if (!responseSent) {
      responseSent = true;
      conn.end();
      res.status(504).json({ error: "Command execution timeout (60s)" });
    }
  }, 60000);

  // Helper to cleanup
  const cleanup = () => {
    clearTimeout(timeout);
    conn.end();
  };

  // Connection ready handler
  conn.on("ready", () => {
    console.log(`Connected to ${server}:${port}`);

    conn.exec(command, (err, stream) => {
      if (err) {
        cleanup();
        if (!responseSent) {
          responseSent = true;
          return res.status(500).json({ error: `Exec failed: ${err.message}` });
        }
        return;
      }

      // Collect stdout
      stream.on("data", (data) => {
        stdout += data.toString();
      });

      // Collect stderr
      stream.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      // Stream error handler
      stream.on("error", (err) => {
        cleanup();
        if (!responseSent) {
          responseSent = true;
          res.status(500).json({ error: `Stream error: ${err.message}` });
        }
      });

      // Stream close handler
      stream.on("close", (code, signal) => {
        cleanup();
        if (!responseSent) {
          responseSent = true;
          res.json({
            success: code === 0,
            exitCode: code,
            signal: signal || null,
            stdout,
            stderr
          });
        }
      });
    });
  });

  // Connection error handler
  conn.on("error", (err) => {
    cleanup();
    if (!responseSent) {
      responseSent = true;
      console.error(`SSH error: ${err.message}`);
      res.status(500).json({ error: `SSH error: ${err.message}` });
    }
  });

  // Connection close handler
  conn.on("close", () => {
    cleanup();
  });

  // Initiate SSH connection
  try {
    conn.connect({
      host: server,
      port: port,
      username: username,
      password: password,
      readyTimeout: 30000
    });
  } catch (err) {
    if (!responseSent) {
      responseSent = true;
      res.status(500).json({ error: `Connection error: ${err.message}` });
    }
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Error:", err);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SSH Service running on port ${PORT}`);
});