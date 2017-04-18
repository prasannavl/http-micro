import * as http from "http";
import * as micro from "http-micro";

export class Server {
    private server: micro.Application;

    constructor() {
        this.server = new micro.Application();
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
            console.log("server listening on %s:%s", host, port);
        });
    }
}