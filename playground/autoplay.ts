import * as http from "http";
import * as micro from "http-micro";
import * as url from "url";
import * as util from "util";

function run() {
    let opts = {
        host: "localhost",
        port: 8000,
        protocol: "http:",
        path: "/test",
        headers: {
        }
    } as http.RequestOptions;

    new Server().run(opts.port, opts.host, () => {
        console.log("server running on %s:%s", opts.host, opts.port);
        http.request(opts, (res) => {
            console.log("-----");            
            console.log(`${res.statusCode} ${res.statusMessage}`);
            console.log(`${util.inspect(res.headers, false, null)}\r\n`);
            res.on("data", (chunk) => {
                process.stdout.write(chunk);
            });
            res.on("end", () => {
                console.log("\r\n-----");
            });
        }).end();
    });
}

class Server {
    private server: micro.Application;

    constructor() {
        this.server = new micro.Application();
        this.setupMiddleware();
    }
    
    setupMiddleware() {
        let app = this.server;
        app.use(micro.mount("/", this.getRouter(), "root"));
    }

    private getRouter() {
        let router = new micro.Router();

        router.get("/hello", (ctx, next) => {
            ctx.sendText("Hello route!");
            return Promise.resolve();
        });

        router.get("/hello-string", (ctx, next) => {
            ctx.sendText("Hello string!");
            return Promise.resolve();
        });

        router.get("/hello-data/:id", (ctx, next) => {
            ctx.sendAsJson(ctx.getRouteData());
            return Promise.resolve();
        });

        
        router.get(/reg(ex)per$/i, (ctx, next) => {
            ctx.sendAsJson(ctx.getRouteData());
            return Promise.resolve();
        });

        router.get("/hello-object", (ctx, next) => {
            ctx.sendAsJson({ message: "Hello world!" });
            return Promise.resolve();
        });

        router.get("/test", (ctx, next) => {
            let res = ctx.res;
            ctx.send("Test!");
            res.end();
            return Promise.resolve();
        });

        return router;
    }

    run(port: number, host = "localhost", ...args: any[]) {
        this.server.listen(port, host, ...args);
    }
}

run();
