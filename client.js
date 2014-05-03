var dgram = require("dgram");
var utils = require("./utils.js");

var FullCone = "Full Cone";  // 0
var RestrictNAT = "Restrict NAT";  // 1
var RestrictPortNAT = "Restrict Port NAT";  // 2
var SymmetricNAT = "Symmetric NAT";  // 3
var NATTYPE = [FullCone, RestrictNAT, RestrictPortNAT, SymmetricNAT];
var argv = process.argv.slice(1);// 去掉'node'就和py相同了

function check_input() {
	if (argv.length != 5 && argv.length != 4) {
		console.log("usage: node client.js <host> <port> <pool>");
		process.exit(1);
	} else if (argv.length == 5) {
		var test_nat_type = parseInt(argv[4]);  // test_nat_type is int
        if ([0, 1, 2, 3].indexOf(test_nat_type) == -1) {
            console.log("test nat type should be [0,1,2,3]")
        }
	} else {
		var test_nat_type = null;
	}
	return test_nat_type;
}


function Client() {
	var master_ip = argv[1] == 'localhost' ? '127.0.0.1' : argv[1];
	var master = {ip: master_ip, port: parseInt(argv[2])};
	var pool = argv[3];
	var sockfd = null, target = null;
	var periodic_running = false;
	var peer_nat_type = null;
    var nat_type = null;
	
	this.main = function(test_nat_type) { // main是唯一public的函数,由它调用各种private
        test_nat_type = typeof test_nat_type != 'undefined' ? test_nat_type : null;
        console.log(test_nat_type)
        if (test_nat_type === null) {
            var python = require('child_process').spawn(
                'python27',
                ["stun.py"]
            );
            python.stdout.on('data', function(data) {
                nat_type = data.toString().split(':')[1].trim();
                var nat_type_id = NATTYPE.indexOf(nat_type);
                console.log(nat_type)
                if (nat_type_id != -1)
                    request_for_connection(nat_type_id, chat);
            });
        }
        else { // 假装正在测试某种类型的NAT, 在check_input中已被限定为0-3
            request_for_connection(test_nat_type, chat);
            nat_type = NATTYPE[test_nat_type];
        }
	};

	var request_for_connection = function (nat_type_id, chat) {
		sockfd = dgram.createSocket("udp4");
		var msg = new Buffer(pool + ' ' + nat_type_id);  // msg是Buffer
        sockfd.send(msg, 0, msg.length, master.port, master.ip);
        var sendmsg = new Buffer('ok');
        var message;

        var messageforconnect = function(msg, rinfo) {
            /*本来是用switch, 但是不知道为什么就是有bug,只能转用多个条件判断*/
            message = msg.toString();
            console.log(message);
            if (message == "ok " + pool) {
                sockfd.send(sendmsg, 0, 2, master.port, master.ip);
                console.log("request sent, waiting for partner in pool %s...", pool);
            } else if (msg.length == 7) {
                var result = utils.bytes2addr(msg);
                target = {ip: result[0], port: result[1]};
                peer_nat_type = NATTYPE[result[2]];
                console.log("connected to %s:%s, its NAT type is %s",
                            result[0], result[1], peer_nat_type);
                sockfd.removeListener('message', messageforconnect);
                if(typeof chat == 'function')
                    chat(nat_type);
                else
                    console.log("callback is not function!");
            } else {
                console.log("Got invalid response: " + msg);
                process.exit(2);
            }
        };
		sockfd.on('message', messageforconnect);
	};

    var chat_fullcone = function() {
        process.stdin.on('data', function(text) {
            var text = new Buffer(text);  //奇怪的是单独测试时不需要转成buffer?
            sockfd.send(text, 0, text.length, target.port, target.ip);
        });
        sockfd.on('message', function(msg, rinfo) {
            console.log("peer: " + msg);
        });
    };
    /*
    def recv_msg(self, sock, is_restrict=False, event=None):
        if is_restrict:
            while True:
                data, addr = sock.recvfrom(1024)
                if self.periodic_running:
                    print "periodic_send is alive"
                    self.periodic_running = False
                    event.set()
                    print "received msg from target, periodic send cancelled, chat start."
                if addr == self.target or addr == self.master:
                    sys.stdout.write(data)
                    if data == "punching...\n":
                        sock.sendto("end punching\n", addr)
        else:
            while True:
                data, addr = sock.recvfrom(1024)
                if addr == self.target or addr == self.master:
                    sys.stdout.write(data)
                    if data == "punching...\n":
                        sock.sendto("end punching", addr)
    */
     function send_msg(text) {
         // 因为text就是Buffer, 所以直接送
         sockfd.send(text, 0, text.length, target.port, target.ip);
     }

    var chat = function(nat_type){
        if (nat_type == SymmetricNAT || peer_nat_type == SymmetricNAT) {
            console.log("Symmetric chat mode");
            chat_symmetric();
        }
        else if (nat_type == FullCone) {
            console.log("FullCone chat mode");
            chat_fullcone();
        }
        else if (nat_type == RestrictNAT || nat_type == RestrictPortNAT) {
            console.log("Restrict chat mode");
            chat_restrict();
        } else {
            console.log("NAT type wrong!");
        }
    };

}


var test_nat_type = check_input();
process.stdin.setEncoding('utf8');
process.stdin.resume();
var c = new Client();
if (test_nat_type != undefined)
    c.main(test_nat_type);
else
    c.main();

