import * as cluster from "cluster";
import * as Promise from "bluebird";
import * as os from "os";

global.Promise = Promise;

if (cluster.isMaster) {
    for (let i = 0; i < os.cpus().length - 1; i++)
        cluster.fork();
} else {
    require("./index");
}