import * as http from "http";
import * as micro from "http-micro";
import * as url from "url";
import * as util from "util";

function run() {
    let opts = {
        host: "localhost",
        port: 8000,
        protocol: "http:",
        path: "/",
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

        app.use((ctx, next) => {
            const res = ctx.res;
            ctx.setHeader("some", ["one", "two", "thre"] as any);
            ctx.sendAsJson({ message: "ok" });
            return Promise.resolve();
        });
    }

    run(port: number, host = "localhost", ...args: any[]) {
        this.server.listen(port, host, ...args);
    }
}

run();
