const { app, BrowserWindow, ipcMain, Tray, Menu, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

let mainWindow;
let tray;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 700,
      frame: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    mainWindow.loadFile('index.html');

    const iconPath = path.join(__dirname, 'app_icon.ico');
    if (fs.existsSync(iconPath)) {
      tray = new Tray(iconPath);
    } else {
      tray = new Tray(require('electron').nativeImage.createEmpty());
    }
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show', click: () => mainWindow.show() },
      { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } }
    ]);
    tray.setToolTip('Discord Spammer');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => mainWindow.show());

    mainWindow.on('close', (event) => {
      if (!app.isQuiting) {
        event.preventDefault();
        mainWindow.hide();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('window-close', () => {
  app.isQuiting = true;
  app.quit();
});

ipcMain.handle('window-minimize', () => {
  mainWindow.hide();
});

ipcMain.handle('check-tokens', async (event, tokens) => {
  console.log('Checking', tokens.length, 'tokens');
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    console.log(`Checking token ${i + 1}/${tokens.length}`);
    
    try {
      const response = await axios.get('https://discord.com/api/v9/users/@me', {
        headers: { 'Authorization': token }
      });
      const avatarUrl = response.data.avatar 
        ? `https://cdn.discordapp.com/avatars/${response.data.id}/${response.data.avatar}.png?size=64`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(response.data.discriminator) % 5}.png`;
      
      event.sender.send('token-checked', { 
        index: i,
        valid: true, 
        token: token.substring(0, 20) + '...', 
        username: response.data.username,
        id: response.data.id,
        avatar: avatarUrl,
        fullToken: token
      });
      console.log('Valid:', response.data.username);
    } catch (err) {
      event.sender.send('token-checked', { 
        index: i,
        valid: false, 
        token: token.substring(0, 20) + '...', 
        error: err.response?.status || err.message || 'Network Error'
      });
      console.log('Invalid:', err.response?.status || err.message || 'Network Error');
    }
    
    if ((i + 1) % 20 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log('Check completed');
  event.sender.send('token-check-complete');
  return { completed: true };
});

ipcMain.handle('load-tokens', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select tokens.txt file',
    filters: [{ name: 'Text Files', extensions: ['txt'] }],
    properties: ['openFile']
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }
  
  const tokensPath = result.filePaths[0];
  
  try {
    const data = fs.readFileSync(tokensPath, 'utf8');
    const tokens = data
      .split(/\r?\n/)
      .map(t => t.trim())
      .filter(t => t && !t.startsWith('#'));
    console.log('Loaded tokens:', tokens.length);
    return tokens;
  } catch (err) {
    console.error('Error loading tokens:', err);
    return [];
  }
});

ipcMain.handle('send-messages', async (event, { tokens, channelId, count, delay }) => {
  let stopped = false;
  
  const stopHandler = () => {
    stopped = true;
  };
  
  ipcMain.once('stop-spam', stopHandler);
  
  for (let i = 0; i < count && !stopped; i++) {
    for (const token of tokens) {
      if (stopped) break;
      
      const currentData = await new Promise(resolve => {
        event.sender.send('get-current-data');
        ipcMain.once('current-data', (e, data) => resolve(data));
      });
      
      let finalMessage = currentData.message;
      
      if (currentData.mods && currentData.mods.leetSpeak) {
        const leet = {'a':'4','e':'3','i':'1','o':'0','l':'1','A':'4','E':'3','I':'1','O':'0','L':'1'};
        finalMessage = finalMessage.split('').map(c => leet[c] || c).join('');
      }
      
      if (currentData.mods && currentData.mods.zalgoText) {
        const zalgo = ['̀','́','̂','̃','̄','̅','̆','̇','̈','̉','̊','̋','̌','̍','̎','̏','̐','̑','̒','̓','̔','̕','̚','̛','̽','̾','̿','̀','́','͂','̓','̈́','͆','͊','͋','͌','͐','͑','͒','͗','͘','͛','ͣ','ͤ','ͥ','ͦ','ͧ','ͨ','ͩ','ͪ','ͫ','ͬ','ͭ','ͮ','ͯ'];
        finalMessage = finalMessage.split('').map(c => c + zalgo[Math.floor(Math.random() * zalgo.length)] + zalgo[Math.floor(Math.random() * zalgo.length)]).join('');
      }
      
      if (currentData.mods && currentData.mods.reverseText) {
        finalMessage = finalMessage.split('').reverse().join('');
      }
      
      if (currentData.options.hashtag) finalMessage = '# ' + finalMessage;
      if (currentData.options.bold) finalMessage = '**' + finalMessage + '**';
      if (currentData.options.strike) finalMessage = '~~' + finalMessage + '~~';
      if (currentData.options.quote) finalMessage = '> ' + finalMessage;
      if (currentData.options.code) finalMessage = '`' + finalMessage + '`';
      if (currentData.options.spoiler) finalMessage = '||' + finalMessage + '||';
      
      if (currentData.mods && currentData.mods.randomEmoji) {
        const emojis = ['😀','😂','🤣','😊','😎','🔥','💯','✨','🎉','💀','👀','❤️','💪','🚀','⚡','🌟','💥','🎯','👑','💎'];
        finalMessage += ' ' + emojis[Math.floor(Math.random() * emojis.length)];
      }
      
      if (currentData.mods && currentData.mods.timestamp) {
        const now = new Date();
        const timestamp = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
        finalMessage += ' ' + timestamp;
      }
      
      if (currentData.mods && currentData.mods.reportBypass) {
        const randomNum = Math.floor(Math.random() * 1000000000);
        finalMessage += ` {${randomNum}}`;
      }
      
      if (currentData.mentionIds) {
        const mentions = currentData.mentionIds.split(' ').filter(id => id.trim()).map(id => `<@${id.trim()}>`).join(' ');
        if (mentions) finalMessage += ' ' + mentions;
      }
      
      try {
        await axios.post(`https://discord.com/api/v9/channels/${channelId}/messages`, 
          { content: finalMessage },
          { headers: { 'Authorization': token, 'Content-Type': 'application/json' } }
        );
        event.sender.send('message-result', { success: true });
        if (!stopped) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (err) {
        event.sender.send('message-result', { success: false, error: err.message });
        if (!stopped) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }
  
  ipcMain.removeListener('stop-spam', stopHandler);
  return { completed: !stopped };
});
