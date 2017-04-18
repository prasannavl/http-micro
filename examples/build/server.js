"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const debugModule = require("debug");
const httpx = require("httpx");
const debug = debugModule("httpx:server");
class Server {
    constructor() {
        this.server = new httpx.Application();
        this.setupMiddleware();
    }
    setupMiddleware() {
        let app = this.server;
        app.use((ctx, next) => {
            const res = ctx.res;
            res.end("Hello world!");
            return Promise.resolve();
        });
    }
    run(port, host = "localhost") {
        this.server.listen(port, host, () => {
            debug("server listening on %s:%s", host, port);
        });
    }
}
exports.Server = Server;
