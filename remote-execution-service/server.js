const express = require("express");
const { Client } = require("ssh2");

const app = express();

app.use(express.json());

app.post("/api/execute", async (req, res) => {

    const {
        server,
        username,
        password,
        command,
        port = 22
    } = req.body;

    if (!server || !username || !password || !command) {
        return res.status(400).json({
            error: "server, username, password and command are required"
        });
    }

    const conn = new Client();

    let stdout = "";
    let stderr = "";

    conn.on("ready", () => {

        console.log(`Connected to ${server}`);

        conn.exec(command, (err, stream) => {

            if (err) {
                conn.end();

                return res.status(500).json({
                    error: err.message
                });
            }

            stream.on("data", (data) => {
                stdout += data.toString();
            });

            stream.stderr.on("data", (data) => {
                stderr += data.toString();
            });

            stream.on("close", (code) => {

                conn.end();

                res.json({
                    success: code === 0,
                    exitCode: code,
                    stdout,
                    stderr
                });

            });

        });

    });

    conn.on("error", (err) => {

        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });

    });

    conn.connect({

        host: server,
        port,

        username,
        password,

        readyTimeout: 30000,

        // DEVELOPMENT ONLY
        // Replace with proper host verification in production.
        hostVerifier: () => true

    });

});

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`SSH Microservice listening on port ${PORT}`);
});
