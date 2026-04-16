const express = require('express');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// สร้างโฟลเดอร์เก็บโปรเจค
const PROJECTS_DIR = path.join(__dirname, 'projects');
if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR);

// เก็บสถานะ process
const processes = new Map();

// หน้าเว็บหลัก
app.get('/', (req, res) => {
    const projects = fs.readdirSync(PROJECTS_DIR).filter(f => fs.statSync(path.join(PROJECTS_DIR, f)).isDirectory());
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>⚡ Web Hosting Control Panel</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    min-height: 100vh;
                    padding: 20px;
                }
                .container {
                    max-width: 1400px;
                    margin: 0 auto;
                }
                h1 {
                    color: #fff;
                    text-align: center;
                    margin-bottom: 30px;
                    font-size: 2.5em;
                    text-shadow: 0 0 10px rgba(0,255,255,0.5);
                }
                .panel {
                    background: rgba(255,255,255,0.1);
                    backdrop-filter: blur(10px);
                    border-radius: 20px;
                    padding: 25px;
                    margin-bottom: 30px;
                    border: 1px solid rgba(255,255,255,0.2);
                }
                .panel h2 {
                    color: #00ffcc;
                    margin-bottom: 20px;
                    border-left: 4px solid #00ffcc;
                    padding-left: 15px;
                }
                input, select, textarea {
                    background: rgba(0,0,0,0.6);
                    border: 1px solid #00ffcc;
                    color: #fff;
                    padding: 12px;
                    border-radius: 10px;
                    font-size: 14px;
                    margin: 5px;
                }
                input[type="text"], textarea {
                    width: calc(100% - 20px);
                }
                textarea {
                    font-family: monospace;
                    height: 200px;
                }
                button {
                    background: linear-gradient(90deg, #00ffcc, #00b386);
                    border: none;
                    padding: 12px 30px;
                    border-radius: 25px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 16px;
                    margin: 5px;
                    transition: transform 0.2s;
                }
                button:hover {
                    transform: scale(1.05);
                }
                .project-card {
                    background: rgba(0,0,0,0.5);
                    border-radius: 15px;
                    padding: 20px;
                    margin-bottom: 20px;
                    border-left: 4px solid #00ffcc;
                }
                .project-name {
                    font-size: 1.5em;
                    color: #00ffcc;
                    margin-bottom: 15px;
                }
                .console-output {
                    background: #000;
                    color: #0f0;
                    font-family: monospace;
                    padding: 15px;
                    border-radius: 10px;
                    max-height: 300px;
                    overflow-y: auto;
                    font-size: 12px;
                    margin-top: 15px;
                }
                .status {
                    display: inline-block;
                    padding: 5px 15px;
                    border-radius: 20px;
                    font-size: 12px;
                    margin-left: 10px;
                }
                .status-running { background: #00ff00; color: #000; }
                .status-stopped { background: #ff0000; color: #fff; }
                .btn-small {
                    padding: 5px 15px;
                    font-size: 12px;
                }
                .grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
                    gap: 20px;
                }
                .log-view {
                    background: #000;
                    color: #0f0;
                    font-family: monospace;
                    padding: 15px;
                    border-radius: 10px;
                    max-height: 400px;
                    overflow-y: auto;
                    font-size: 11px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>⚡ Web Hosting Control Panel</h1>
                
                <!-- สร้างโปรเจคใหม่ -->
                <div class="panel">
                    <h2>📁 สร้างโปรเจคใหม่</h2>
                    <form action="/create-project" method="POST">
                        <input type="text" name="projectName" placeholder="ชื่อโปรเจค (เช่น my-bot)" required>
                        <select name="template">
                            <option value="basic">Basic Node.js</option>
                            <option value="express">Express Server</option>
                            <option value="discord">Discord Bot</option>
                        </select>
                        <button type="submit">➕ สร้างโปรเจค</button>
                    </form>
                </div>

                <!-- รายการโปรเจค -->
                <div class="panel">
                    <h2>📦 โปรเจคทั้งหมด</h2>
                    <div id="projects-list">
                        ${projects.map(project => `
                            <div class="project-card" id="project-${project}">
                                <div class="project-name">
                                    📂 ${project}
                                    <span class="status status-stopped" id="status-${project}">⏹️ STOPPED</span>
                                </div>
                                <div>
                                    <button class="btn-small" onclick="runProject('${project}')">▶️ รัน</button>
                                    <button class="btn-small" onclick="stopProject('${project}')">⏹️ หยุด</button>
                                    <button class="btn-small" onclick="restartProject('${project}')">🔄 รีสตาร์ท</button>
                                    <button class="btn-small" onclick="viewLogs('${project}')">📋 ดู Logs</button>
                                    <button class="btn-small" onclick="deleteProject('${project}')">🗑️ ลบ</button>
                                </div>
                                <div>
                                    <input type="text" id="cmd-${project}" placeholder="ใส่คำสั่ง..." style="width: 70%;">
                                    <button onclick="runCommand('${project}')">⚡ รันคำสั่ง</button>
                                </div>
                                <div id="output-${project}" class="console-output" style="display: none;"></div>
                                <div id="log-${project}" class="log-view" style="display: none; margin-top: 10px;"></div>
                            </div>
                        `).join('')}
                        ${projects.length === 0 ? '<p style="color:#fff; text-align:center;">ยังไม่มีโปรเจค กดสร้างเลย!</p>' : ''}
                    </div>
                </div>

                <!-- Console รวม -->
                <div class="panel">
                    <h2>📟 Master Console</h2>
                    <form action="/master-command" method="POST">
                        <input type="text" name="command" placeholder="ใส่คำสั่ง Linux (เช่น ls, npm install, pm2 list)" style="width: 80%;">
                        <button type="submit">🎮 รันบนระบบหลัก</button>
                    </form>
                    <div class="console-output" id="master-output">${req.query.masterOutput || 'พร้อมใช้งาน'}</div>
                </div>
            </div>

            <script>
                async function runProject(name) {
                    const res = await fetch('/run/' + name, { method: 'POST' });
                    const data = await res.json();
                    document.getElementById('status-' + name).className = 'status status-running';
                    document.getElementById('status-' + name).innerHTML = '▶️ RUNNING';
                    alert(data.message);
                }

                async function stopProject(name) {
                    const res = await fetch('/stop/' + name, { method: 'POST' });
                    const data = await res.json();
                    document.getElementById('status-' + name).className = 'status status-stopped';
                    document.getElementById('status-' + name).innerHTML = '⏹️ STOPPED';
                    alert(data.message);
                }

                async function restartProject(name) {
                    await stopProject(name);
                    setTimeout(() => runProject(name), 1000);
                }

                async function runCommand(name) {
                    const cmd = document.getElementById('cmd-' + name).value;
                    const outputDiv = document.getElementById('output-' + name);
                    outputDiv.style.display = 'block';
                    outputDiv.innerHTML = '⏳ กำลังรัน...';
                    
                    const res = await fetch('/command/' + name, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ command: cmd })
                    });
                    const data = await res.json();
                    outputDiv.innerHTML = data.output;
                }

                async function viewLogs(name) {
                    const logDiv = document.getElementById('log-' + name);
                    const res = await fetch('/logs/' + name);
                    const data = await res.json();
                    logDiv.style.display = 'block';
                    logDiv.innerHTML = data.logs || 'ไม่มี logs';
                }

                async function deleteProject(name) {
                    if(confirm('ลบโปรเจค ' + name + ' แน่นอน?')) {
                        const res = await fetch('/delete/' + name, { method: 'DELETE' });
                        const data = await res.json();
                        if(data.success) location.reload();
                        else alert(data.error);
                    }
                }

                // refresh status ทุก 5 วิ
                setInterval(async () => {
                    const res = await fetch('/status');
                    const status = await res.json();
                    for(const [name, running] of Object.entries(status)) {
                        const statusSpan = document.getElementById('status-' + name);
                        if(statusSpan) {
                            if(running) {
                                statusSpan.className = 'status status-running';
                                statusSpan.innerHTML = '▶️ RUNNING';
                            } else {
                                statusSpan.className = 'status status-stopped';
                                statusSpan.innerHTML = '⏹️ STOPPED';
                            }
                        }
                    }
                }, 5000);
            </script>
        </body>
        </html>
    `);
});

// API: สร้างโปรเจค
app.post('/create-project', (req, res) => {
    const { projectName, template } = req.body;
    const projectPath = path.join(PROJECTS_DIR, projectName);
    
    if (fs.existsSync(projectPath)) {
        return res.send('<script>alert("ชื่อโปรเจคซ้ำ!"); window.location.href="/";</script>');
    }
    
    fs.mkdirSync(projectPath);
    
    // สร้างไฟล์ตาม template
    if (template === 'basic') {
        fs.writeFileSync(path.join(projectPath, 'index.js'), `
console.log('Hello from ${projectName}!');
setInterval(() => {
    console.log('Server running...', new Date().toLocaleString());
}, 5000);
        `);
        fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({
            name: projectName,
            version: "1.0.0",
            main: "index.js"
        }, null, 2));
    } else if (template === 'express') {
        fs.writeFileSync(path.join(projectPath, 'index.js'), `
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Hello from ${projectName}!'));
app.listen(3000, () => console.log('Server running on port 3000'));
        `);
        fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({
            name: projectName,
            version: "1.0.0",
            dependencies: { express: "^4.18.2" },
            main: "index.js"
        }, null, 2));
    }
    
    // ติดตั้ง dependencies อัตโนมัติ
    exec('npm install', { cwd: projectPath }, (err, stdout) => {
        console.log(`Installed deps for ${projectName}:`, stdout);
    });
    
    res.send('<script>alert("สร้างโปรเจคเรียบร้อย!"); window.location.href="/";</script>');
});

// API: รันโปรเจค
app.post('/run/:name', (req, res) => {
    const name = req.params.name;
    const projectPath = path.join(PROJECTS_DIR, name);
    
    if (processes.has(name)) {
        return res.json({ success: false, message: 'กำลังรันอยู่แล้ว' });
    }
    
    const child = spawn('node', ['index.js'], { cwd: projectPath, shell: true });
    processes.set(name, child);
    
    // บันทึก logs
    const logFile = path.join(projectPath, 'logs.txt');
    child.stdout.on('data', (data) => {
        fs.appendFileSync(logFile, data.toString());
    });
    child.stderr.on('data', (data) => {
        fs.appendFileSync(logFile, data.toString());
    });
    
    child.on('exit', () => {
        processes.delete(name);
    });
    
    res.json({ success: true, message: 'รัน ' + name + ' เรียบร้อย' });
});

// API: หยุดโปรเจค
app.post('/stop/:name', (req, res) => {
    const name = req.params.name;
    if (processes.has(name)) {
        processes.get(name).kill();
        processes.delete(name);
        res.json({ success: true, message: 'หยุด ' + name + ' เรียบร้อย' });
    } else {
        res.json({ success: false, message: 'ไม่ได้รันอยู่' });
    }
});

// API: รันคำสั่งในโปรเจค
app.post('/command/:name', (req, res) => {
    const name = req.params.name;
    const { command } = req.body;
    const projectPath = path.join(PROJECTS_DIR, name);
    
    exec(command, { cwd: projectPath, timeout: 10000 }, (err, stdout, stderr) => {
        res.json({ output: stdout || stderr || err?.message || 'Done' });
    });
});

// API: ดู logs
app.get('/logs/:name', (req, res) => {
    const name = req.params.name;
    const logFile = path.join(PROJECTS_DIR, name, 'logs.txt');
    
    if (fs.existsSync(logFile)) {
        const logs = fs.readFileSync(logFile, 'utf8');
        res.json({ logs: logs.slice(-5000) });
    } else {
        res.json({ logs: 'ไม่มี logs' });
    }
});

// API: สถานะทั้งหมด
app.get('/status', (req, res) => {
    const status = {};
    for (const [name] of processes) {
        status[name] = true;
    }
    const projects = fs.readdirSync(PROJECTS_DIR).filter(f => fs.statSync(path.join(PROJECTS_DIR, f)).isDirectory());
    for (const project of projects) {
        if (!status[project]) status[project] = false;
    }
    res.json(status);
});

// API: ลบโปรเจค
app.delete('/delete/:name', (req, res) => {
    const name = req.params.name;
    const projectPath = path.join(PROJECTS_DIR, name);
    
    if (processes.has(name)) {
        processes.get(name).kill();
        processes.delete(name);
    }
    
    fs.rmSync(projectPath, { recursive: true, force: true });
    res.json({ success: true });
});

// API: รันคำสั่งบนระบบหลัก
app.post('/master-command', (req, res) => {
    const { command } = req.body;
    exec(command, { timeout: 30000 }, (err, stdout, stderr) => {
        const output = (stdout || stderr || err?.message || 'Done').replace(/\n/g, '<br>');
        res.redirect('/?masterOutput=' + encodeURIComponent(output));
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Control Panel: http://localhost:${PORT}`);
});