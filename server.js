var dgram = require("dgram");
var utils = require("./utils.js");
var print = utils.print;

var FullCone = "Full Cone";  // 0
var RestrictNAT = "Restrict NAT";  // 1
var RestrictPortNAT = "Restrict Port NAT";  // 2
var SymmetricNAT = "Symmetric NAT";  // 3
var NATTYPE = [FullCone, RestrictNAT, RestrictPortNAT, SymmetricNAT];
var argv = process.argv.slice(1);// 去掉'node'就和py相同了

function check_input() {
    if (argv.length != 2) {
        print("usage: ndoe server.js port");
        exit(1);
    }
    else {
        function isNormalInteger(str) {
            var n = ~~Number(str);
            return String(n) === str && n > 0;
        }
        if (!isNormalInteger(argv[1]))
            print("port should be a positive integer!");
        else
            main(parseInt(argv[1]));
    }
}

function addr(ip, port) {
    this.ip = ip;
    this.port = port;
}

function ClientInfo(addr, nat_type_id) {
    this.addr = addr;
    this.nat_type_id = nat_type_id;
}

function addrIndexOf(arr, o) {
    for (var i = 0; i < arr.length; i++) {
        if (arr[i].address == o.address && arr[i].port == o.port) {
            return i;
        }
    }
    return -1;
}

function main(port) {
    var sock = dgram.createSocket('udp4');
    sock.bind(("", port));
    print("listening on *:%d (udp)", port);
    var poolqueue = {};
    var received_addr = new Array();
    var pool;
    var client_addr;
    var nat_type_id;
    var respond;
    sock.on("message", function(msg, rinfo) {
        var message = msg.toString('utf8');
        client_addr = new addr(rinfo.address, rinfo.port);
        /* 可能存在的转发逻辑,
        if message 以 "msg" 开头, 就转发
         */
        if (addrIndexOf(received_addr, client_addr) == -1) { //第一次接收
            received_addr.push(client_addr);  // 把這個addr加入已知addr列表
            print("connection from %s:%d", rinfo.address, rinfo.port);
            pool = message.trim().split(' ')[0];
            nat_type_id = message.trim().split(' ')[1];
            respond = new Buffer("ok " + pool);
            sock.send(respond, 0, respond.length, rinfo.port, rinfo.address);
            print("pool=%s, nat_type=%s, ok sent to client", pool, NATTYPE[parseInt(nat_type_id)]);
        } else if (message == "ok") {
            //接收到客戶端的"ok",必須是經過了第一次的,即client_addr in received_addr
            print("request received for pool:" + pool);
            if (pool in poolqueue) {
                var a = poolqueue[pool].addr;
                var b = client_addr;
                var nat_type_id_a = poolqueue[pool].nat_type_id;
                var nat_type_id_b = nat_type_id;
                respond = utils.addr2bytes(a, nat_type_id_a);
                print(respond.length);
                print(b);
                sock.send(respond, 0, respond.length, b.port, b.ip);
                respond = utils.addr2bytes(b, nat_type_id_b);
                print(a);
                sock.send(respond, 0, respond.length, a.port, a.ip);
                print("linked" + pool);
                delete poolqueue[pool];
            }
            else {
                poolqueue[pool] = new ClientInfo(client_addr, nat_type_id);
            }
        }
    });
}

check_input()
