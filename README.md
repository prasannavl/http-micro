# http-micro
Micro-framework on top of node's http module

`npm install http-micro`

### Highlights
- Written in and works with Typescipt
- Koa-like contexts that can be generically typed in TS.
- Promises for all middleware
- Provides middleware chaining and composition over core `http` module.
- Extremely small code-base.
- Sane error handling with promises, unlike Koa.

### Example

```js
import * as micro from "http-micro";

let app = new micro.Application();
// When using Typescript, context can be 
// generically typed to one that implements
// the IContext interface.
// 
// let app = new micro.ApplicationCore<MyContext>();

app.use(async (ctx, next) => {
    if (url.parse(ctx.req.url)
        .pathname == "/async") {
        ctx.res.end("Hello world from async!");
    }
});

app.use((ctx, next) => {
    const res = ctx.res;
    res.end("Hello world!");
    return Promise.resolve();
});

app.listen(8000);
```
