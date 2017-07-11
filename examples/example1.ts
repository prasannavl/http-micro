import * as http from "http";
import * as micro from "http-micro";
import * as url from "url";

export class Server {
    private server: micro.App;

    constructor() {
        this.server = new micro.App();
        this.setupMiddleware();
    }
    
    setupMiddleware() {
        let app = this.server;
        
        app.use(async (ctx, next) => {
            if (url.parse(ctx.req.url)
                .pathname == "/async") {
                ctx.res.end("Hello world from async!");
            } else {
                await next();
            }
        });

        app.use((ctx, next) => {
            const res = ctx.res;
            res.end("Hello world!");
            return Promise.resolve();
        });
    }

    listen(port: number, host = "localhost", ...args: any[]) {
        (this.server.createServer().listen as any)(port, host, ...args);
    }
}