import * as http from "http";
import * as path from "path";
import { Middleware, ApplicationCore, Context, IContext, Router, mount } from "http-micro";
import * as url from "url";
import * as os from "os";

class AppContext extends Context {

}

export class Server {
    private server: ApplicationCore<AppContext>;

    constructor() {
        this.server = new ApplicationCore<AppContext>(
            (app, req, res) => new AppContext(app, req, res));
        this.setupMiddleware();
    }

    setupMiddleware() {
        let app = this.server;

        app.use((ctx, next) => {
            if (ctx.req.url.endsWith("raw")) {
                ctx.res.end("Hello from raw middlware!");
                return Promise.resolve();
            } else {
                return next();
            }
        });

        app.use(mount("/api", (ctx, next) => {
            ctx.sendAsJson({
                message: "api route!",
                routePath: ctx.getRoutePath(),
                path: ctx.getUrl(),
            });
            return Promise.resolve();
        }, "api"));

        app.use(mount("/", this.getRouter(), "root"));
        app.use(mount("/chain/", this.getRouterChain(), "chain"));

        app.use(async (ctx, next) => {
            ctx.res.end("Not found");
        });
    }

    private getRouter() {
        let router = new Router<AppContext>();

        router.get("/hello", (ctx, next) => {
            ctx.res.end("Hello route!");
            return Promise.resolve();
        });

        router.get("/hello-string", (ctx, next) => {
            ctx.res.end("Hello string!");
            return Promise.resolve();
        });

        router.get("/hello-object", (ctx, next) => {
            ctx.res.end(JSON.stringify({ message: "Hello world!" }));
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

        router.use(mount("/c1", router2, "router2"));
        router.use(mount("/c2/", router3, "router3"));

        return router;
    }

    run(port: number, host = "localhost") {
        this.server.listen(port, host, () => {
            console.log("server listening on %s:%s", host, port);
        });
    }
}