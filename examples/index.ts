import { Server } from "./server";

let app = new Server();
app.run(8000);

console.log("server running");