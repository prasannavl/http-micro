import * as debugModule from "debug";
import * as http from "http";
import * as httpx from "httpx";

const debug = debugModule("httpx:server");

export class Server {
    private server: httpx.Application;

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

    run(port: number, host = "localhost") {
        this.server.listen(port, host, () => {
            debug("server listening on %s:%s", host, port);
        });
    }
}