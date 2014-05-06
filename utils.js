var addr2bytes = function(addr, nat_type_id) {
	var host = addr.ip;  // "0.0.0.0"
	var port = addr.port;  // int 23456
	var bytes = Buffer(7);  // 和之前不同,现在用7个字节
	var first4bytes = Buffer(host.split('.'));  // 用数字初始化
	var byte5 = Math.floor(port/256);
	var byte6 = port - byte5 * 256;
	var next2bytes = Buffer([byte6, byte5]);
	first4bytes.copy(bytes);
	next2bytes.copy(bytes, 4);
	// 因为id不会超过4, 所以写最后一个字节就行, 1=0x33, 注意是字符串不是Int
	bytes.write(nat_type_id.toString(), 6);  
	return bytes;
}

var bytes2addr= function(bytes) {
	var nat_type_id = bytes.readUInt8(6);  // 这是字符串不是Int
	var ip = Array();
	for (var i=0; i<4;i++) {
		ip.push(bytes.readUInt8(i));
	}
	ip = ip.join('.');
	var port = bytes.readUInt16LE(4);
	return [ip, port, nat_type_id];
}

function test() {
    var b = addr2bytes(['127.0.0.1', 29325], 0);
    console.log(addr2bytes(['127.0.0.1', 29325], 0));
    var result = bytes2addr(b);
    var ip = result[0];
    var port = result[1];
    var id = result[2];
    console.log(ip);
    console.log(port)
    console.log(id);
}

//test();
exports.bytes2addr = bytes2addr;
exports.addr2bytes = addr2bytes;
exports.print = console.log;

