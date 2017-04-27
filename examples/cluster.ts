import * as cluster from "cluster";
import * as Promise from "bluebird";

global.Promise = Promise;

if (cluster.isMaster) {
    for (let i = 0; i < 2; i++)
        cluster.fork();
} else {
    require("./index");
}