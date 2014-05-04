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
	if (argv.length != 5 && argv.length != 4) {
		print("usage: node client.js <host> <port> <pool>");
		process.exit(1);
	} else if (argv.length == 5) {
		var test_nat_type = parseInt(argv[4]);  // test_nat_type is int
        if ([0, 1, 2, 3].indexOf(test_nat_type) == -1) {
            print("test nat type should be [0,1,2,3]")
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
	var peer_nat_type = null;
    var nat_type = null;
	
	this.main = function(test_nat_type) { // main是唯一public的函数,由它调用各种private
        test_nat_type = typeof test_nat_type != 'undefined' ? test_nat_type : null;
        print(test_nat_type)
        if (test_nat_type === null) {
            var python = require('child_process').spawn(
                'python27',
                ["stun.py"]
            );
            python.stdout.on('data', function(data) {
                nat_type = data.toString().split(':')[1].trim();
                var nat_type_id = NATTYPE.indexOf(nat_type);
                print(nat_type)
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
            print(message);
            if (message == "ok " + pool) {
                sockfd.send(sendmsg, 0, 2, master.port, master.ip);
                print("request sent, waiting for partner in pool %s...", pool);
            } else if (msg.length == 7) {
                var result = utils.bytes2addr(msg);
                target = {ip: result[0], port: result[1]};
                peer_nat_type = NATTYPE[result[2]];
                print("connected to %s:%s, its NAT type is %s",
                            result[0], result[1], peer_nat_type);
                sockfd.removeListener('message', messageforconnect);
                if(typeof chat == 'function')
                    chat(nat_type);
                else
                    print("callback is not function!");
            } else {
                print("Got invalid response: " + msg);
                process.exit(2);
            }
        };
		sockfd.on('message', messageforconnect);
	};

    var chat = function(nat_type){
        if (nat_type == SymmetricNAT || peer_nat_type == SymmetricNAT) {
            print("Symmetric chat mode");
            chat_symmetric();
        }
        else if (nat_type == FullCone) {
            print("FullCone chat mode");
            chat_fullcone();
        }
        else if (nat_type == RestrictNAT || nat_type == RestrictPortNAT) {
            print("Restrict chat mode");
            chat_restrict();
        } else {
            print("NAT type wrong!");
        }
    };

    var chat_fullcone = function() {
        process.stdin.on('data', function(text) {
            var text = new Buffer(text);  //奇怪的是单独测试时不需要转成buffer?
            sockfd.send(text, 0, text.length, target.port, target.ip);
        });
        sockfd.on('message', function(msg, rinfo) {
            var msg = msg.toString('utf8');
            print("peer: " + msg);
            if (msg == 'punching...') {
                var text = new Buffer("end punching");
                sockfd.send(text, 0, text.length, target.port, target.ip);
            }
        });
    };

    //现在没必要用event,直接在periodic_running=false的时候开stdin.on
    var chat_restrict = function() {
        var periodic_running = true;
        function send(count) {
            var text = new Buffer("punching...");
            sockfd.send(text, 0, text.length, target.port, target.ip);
            print("UDP punching package %d sent", count);
            setTimeout(function(){
                if (periodic_running)
                    send(count+1);
            }, 500);
        }
        send(0);
        sockfd.on('message', function(msg, rinfo) {
            if (periodic_running) {
                print("periodic_send is alive");
                periodic_running = false;
                process.stdin.on('data', function(text) {
                    var text = new Buffer(text);
                    sockfd.send(text, 0, text.length, target.port, target.ip);
                });
            }
            var msg = msg.toString('utf8');
            print("peer: " + msg);
            if (msg == 'punching...') {
                var text = new Buffer("end punching");
                sockfd.send(text, 0, text.length, target.port, target.ip);
            }
        });
    };

    var chat_symmetric = function() {
        //通过服务器转发, 这部分需要跟智华师兄协作完成
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

