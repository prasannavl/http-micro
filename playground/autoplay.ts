import * as http from "http";
import { Application, Context, Router, App } from "http-micro";
import * as url from "url";
import * as util from "util";

function run() {
    let opts = {
        host: "localhost",
        port: 8000,
        protocol: "http:",
    } as http.RequestOptions;

    let requests = [
        { path: "/test" },
        { path: "/hello" },
        { path: "/api" },
        {
            path: "/chain/echo", method: "POST",
            headers: { "content-type": "application/json" },    
            body: `{ "message": "hello" }`
        },
        { path: "/chain/c1/hello" },
        { path: "/chain/c2/hello" }
    ];

    new Server().listen(opts.port, opts.host, () => {
        console.log("server running on %s:%s", opts.host, opts.port);
        requests.forEach(x => {
            let req = http.request(Object.assign({}, opts, x), (res) => {
                console.log("-----");
                console.log(`${res.statusCode} ${res.statusMessage}`);
                console.log(`${util.inspect(res.headers, false, null)}\r\n`);
                res.on("data", (chunk) => {
                    process.stdout.write(chunk);
                });
                res.on("end", () => {
                    console.log("\r\n-----");
                });
            });
            let body = (x as any).body;
            if (body) {
                req.write(body);
            }
            req.end();
        });
    });
}

class AppContext extends Context {}

export class Server {
    private app: Application<AppContext>;

    constructor() {
        this.app = new Application<AppContext>(
            (app, req, res) => new AppContext(app, req, res));
        this.setupMiddleware();
    }

    setupMiddleware() {
        let app = this.app;
        app.use((ctx, next) => {
            if (ctx.req.url.endsWith("raw")) {
                ctx.res.end("Hello from raw middlware!");
                return Promise.resolve();
            } else {
                return next();
            }
        });
        app.use(this.getRouter());
    }

    private getRouter() {
        let router = new Router<AppContext>();

        router.get("/hello", (ctx, next) => {
            ctx.sendText("Hello route!");
            return Promise.resolve();
        });

        router.get("/hello-string", (ctx, next) => {
            ctx.sendText("Hello string!");
            return Promise.resolve();
        });

        router.get("/hello-object", (ctx, next) => {
            ctx.sendAsJson({ message: "Hello world!" });
            return Promise.resolve();
        });

        router.post("/echo-object", async (ctx, next) => {
            let body = await ctx.getRequestBody();
            ctx.send(body);
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

        router.get("/test", (ctx, next) => {
            let res = ctx.res;
            ctx.send("Test!");
            res.end();
            return Promise.resolve();
        });

        router.all("/api", (ctx, next) => {
            ctx.sendAsJson({
                message: "api route!",
            });
            return Promise.resolve();
        });

        router.get("/api/numbers", (ctx, next) => {
            let str = "";
            for (let i = 0; i < 1000; i++) {
                str += i.toString() + "\n";
            }
            ctx.res.end(str);
            return Promise.resolve();
        });

        router.use("/chain", this.getRouterChain());
        return router;
    }

    private getRouterChain() {
        let router = new Router<AppContext>();

        router.get("/hello", (ctx, next) => {
            ctx.res.end("chain 0: hello!");
            return Promise.resolve();
        });

        let router2 = new Router<AppContext>();

        router2.get("/hello", (ctx, next) => {
            ctx.res.end("chain 1: hello!");
            return Promise.resolve();
        });

        let router3 = new Router<AppContext>();

        router3.get("/hello", (ctx, next) => {
            ctx.res.end("chain 2: hello!");
            return Promise.resolve();
        });

        let meldedRouter = new Router<AppContext>();
        meldedRouter.post("/echo", async (ctx, next) => {
            let body = await ctx.getRequestBody();
            ctx.send(body);
            return Promise.resolve();
        });

        router.use(meldedRouter);
        router.use("/c1", router2);
        router.use("/c2", router3);

        return router;
    }

    listen(port: number, host = "localhost", ...args: any[]) {
        let server = this.app.createServer();
        (server.listen as any)(port, host, ...args);
    }
}

run();
