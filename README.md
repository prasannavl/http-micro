# httpx
Micro-framework on top of node's http module

`npm install httpx`

### Highlights
- Works with Typescipt
- Koa-like contexts that can be generically typed in TS.
- Promises for all middleware
- Provides a middleware chaining and composition over core `http` module.
- Extremely small code-base.
- Sane error handling with promises, unlike Koa.

### Example

```js
import * as httpx from "httpx";

let app = new httpx.Application();

app.use((ctx, next) => {
    const res = ctx.res;
    res.end("Hello world!");
    return Promise.resolve();
});

app.listen(8000);
```
