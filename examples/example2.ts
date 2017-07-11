import * as http from "http";
import * as path from "path";
import { Middleware, Application, Context, Router } from "http-micro";
import * as url from "url";
import * as os from "os";
import { MicroServer } from "http-micro/lib/server-utils";

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

        let root = new Router();     

        root.all("/api", (ctx, next) => {
            ctx.sendAsJson({
                message: "api route!",
            });
            return Promise.resolve();
        });

        root.use("/chain", this.getRouterChain());
        root.use("/shutdown", (ctx) => {
            console.log("time: " + new Date().toTimeString() + "; shutdown request");
            ctx.res.end();
            ctx.getItem<MicroServer>("_server").shutdown(5000, () => {
                console.log("time: " + new Date().toTimeString() + "; shutting down");
            });
            return Promise.resolve();
        });
        app.use(this.getRouter());
        app.use(root);
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

        // This will not work since it's taken over by the api mount.        
        router.get("/api/numbers", (ctx, next) => {
            let str = "";
            for (let i = 0; i < 1000; i++) {
                str += i.toString() + "\n";
            }
            ctx.res.end(str);
            return Promise.resolve();
        });

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

        router.use("/c1", router2);
        router.use("/c2", router3);

        return router;
    }

    run(port: number, host = "localhost", ...args: any[]) {
        let server = this.app.createServer();
        this.app.setItem("_server", server);
        (server.listen as any)(port, host, ...args);
    }
}