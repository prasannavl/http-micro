"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./server");
let app = new server_1.Server();
app.run(8000);
console.log("server running");
