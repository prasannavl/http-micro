const micro = require("http-micro");
const url = require("url");

let app = new micro.App();
// When using Typescript, context can be 
// generically typed to one that implements
// the IContext interface.
//
// `let app = new micro.Application<MyContext>(
//          (app, req, res) => new MyContext());`
//
// Raw node req, and res untouched.
// Convenience functions are also provided, used
// later in the example.

app.use(async (ctx, next) => {
    if (url.parse(ctx.req.url)
        .pathname == "/async") {
        ctx.res.end("Hello world from async!");
    } else {
        await next();
    }
});

app.use(async (ctx, next) => {
    await next();
})

app.use(async (ctx, next) => {
    if (url.parse(ctx.req.url)
        .pathname == "/async-await") {
        await Promise.resolve();
        await Promise.resolve();
        ctx.res.end("Hello world from awaited async!");        
    } else {
        await next();
    }
});

let router = new micro.Router();
// When using Typescript, can again be generic,
// `let router = new Router<MyContext>();`

router.get("/hello", (ctx) => {
    ctx.sendText("Hello route!");
    return Promise.resolve();
});

router.get("/hello-string", async (ctx) => {
    ctx.sendText("Hello string!");
});

router.get("/hello-object", (ctx) => {
    ctx.sendAsJson({ message: "Hello world!" });
    return Promise.resolve();
});

let router1 = new micro.Router();

router1.get("/hello", (ctx) => {
    ctx.sendText("chain 1: hello!");
    return Promise.resolve();
});

let router2 = new micro.Router();

router2.get("/hello", (ctx) => {
    ctx.res.end("chain 2: hello!");
    return Promise.resolve();
});

router.use("/r1", router1);
router.use("/r2", router2);

app.use(router);

app.listen(8000, "localhost", () => {
    console.log("listening");
});