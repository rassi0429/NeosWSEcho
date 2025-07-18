const http = require('http');
const WebSocket = require('ws');

const server = http.createServer();
const wss = new WebSocket.Server({ noServer: true });

const roomMap = new Map()
let clientCount = 0


wss.on('connection', (ws, request) => {

    const room = request.url

    clientCount += 1
    ws.isAlive = true;


    if (!roomMap.has(room)) {
        roomMap.set(room, [ws])
    } else {
        roomMap.set(room, [ws, ...roomMap.get(room)])
    }

    console.log(`${new Date().toLocaleString()} \t Client connected: ${room} :count ${roomMap.get(room).length}`)

    ws.checkAlive = false
    ws.on('pong', () => { ws.checkAlive = false });

    const interval = setInterval(() => {
        if(ws.checkAlive) {
            ws.isAlive = false
        }

        ws.checkAlive = true
        ws.ping()
    }, 3000)

    ws.on('message', (message) => {
        const room = roomMap.get(request.url)
        if (!room) return
        
        // メッセージの検証とサニタイズ
        let processedMessage;
        try {
            if (Buffer.isBuffer(message)) {
                // バイナリデータの場合、有効なUTF-8文字列に変換を試行
                processedMessage = message.toString('utf8').replace(/\uFFFD/g, '');
                // 空文字列になった場合はスキップ
                if (processedMessage.length === 0) {
                    console.log('Skipped invalid binary message');
                    return;
                }
            } else {
                processedMessage = message.toString();
            }
            
            // 無効な制御文字を除去
            processedMessage = processedMessage.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
            
        } catch (error) {
            console.error('Error processing message:', error);
            return;
        }
        
        room.filter(d => d.isAlive).forEach((client) => {
            try {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(processedMessage);
                }
            } catch (error) {
                console.error('Error sending message:', error);
            }
        });
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error in room ${room}:`, error)
        ws.isAlive = false
    });

    ws.on("close", () => {
        clearInterval(interval)
        ws.isAlive = false
        console.log(`${new Date().toLocaleString()} \t Client disconnected: ${room}`)
    })
});


server.on('upgrade', function (request, socket, head) {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

setInterval(cleanRoomMap, 10 * 1000)

function cleanRoomMap() {
    console.log("RoomMap Clean Start")
    let cc = 0
    roomMap.forEach((clients, room) => {
        const newClients = clients.filter(d => d.isAlive)
        cc += newClients.length
        const diff = clients.length - newClients.length
        if (diff !== 0) {
            if (newClients.length === 0) {
                roomMap.delete(room)
                console.log(`Room ${room} was deleted dut to no clients`)
                return
            }
            roomMap.set(room, newClients)
            console.log(`Room ${room} was cleaned ${diff} clients`)
        }

    })
    clientCount = cc
    console.log(clientCount)
    console.log("RoomMap Clean Done")
}

// to prometheus
server.on("request", (req, res) => {
    if (req.method !== "GET") {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('method not allowed');
        return
    }

    const roomCountText = makeGaugeText("rooms", roomMap.size)
    const clientCountText = makeGaugeText("clients", clientCount)


    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end([roomCountText, clientCountText].join("\n"));
    return
})

const makeGaugeText = (name, data) => {
    return `# HELP wsecho_${name} wsecho ${name} value
# TYPE wsecho_${name} gauge
wsecho_${name} ${data}`
}

server.listen(3000);
