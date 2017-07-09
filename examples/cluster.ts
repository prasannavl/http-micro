import * as cluster from "cluster";
import * as Promise from "bluebird";

global.Promise = Promise;

if (cluster.isMaster) {
    for (let i = 0; i < 3; i++)
        cluster.fork();
} else {
    require("./index");
}