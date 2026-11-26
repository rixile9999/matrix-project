// Each proxy is reachable on one internal coach network. It only tunnels TLS to
// the provider selected by the operator when the service was launched.
import http from 'node:http';
import net from 'node:net';
import {chmodSync,existsSync,unlinkSync} from 'node:fs';
const allowed=new Set(process.env.DESTINATIONS.split(',').map(host=>host+':443'));
const server=http.createServer((req,res)=>{res.writeHead(403).end();});
server.on('connect',(req,client,head)=>{
	if (!allowed.has(req.url)) return client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
	const remote=net.connect(443,req.url.split(':')[0],()=>{
		client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
		if (head.length) remote.write(head);
		remote.pipe(client).pipe(remote);
	});
	remote.setTimeout(150000,()=>remote.destroy());
	remote.on('error',()=>client.destroy()); client.on('error',()=>remote.destroy());
	remote.on('close',()=>client.destroy()); client.on('close',()=>remote.destroy());
});
const socket='/relay/connect.sock';
if (existsSync(socket)) unlinkSync(socket);
server.listen(socket,()=>chmodSync(socket,0o666));
