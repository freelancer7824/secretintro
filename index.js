const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();
const db = admin.firestore();

const ONESIGNAL_APP_ID = "8238cf86-d360-4006-99aa-dbc87015495f";
const ONESIGNAL_REST_API_KEY = "nfsh6bakzus3u75cz6vchy3vm"; // ⚠️ এখানে বসান

exports.sendPushOnNewMessage = functions.firestore
  .document('chats/{chatId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    
    const beforeMsgs = before.messages || [];
    const afterMsgs = after.messages || [];
    
    if (afterMsgs.length <= beforeMsgs.length) return null;
    
    const newMsg = afterMsgs[afterMsgs.length - 1];
    const senderId = newMsg.sender;
    const participants = after.participants || [];
    
    const receiverId = participants.find(p => p !== senderId);
    if (!receiverId) return null;
    
    const [senderDoc, receiverDoc] = await Promise.all([
      db.collection('users').doc(senderId).get(),
      db.collection('users').doc(receiverId).get()
    ]);
    
    if (!senderDoc.exists || !receiverDoc.exists) return null;
    
    const senderData = senderDoc.data();
    const receiverData = receiverDoc.data();
    
    const oneSignalId = receiverData.oneSignalId;
    if (!oneSignalId) {
      console.log('⚠️ No OneSignal ID for:', receiverId);
      return null;
    }
    
    const senderName = senderData.fullName || senderData.firstName || 'Someone';
    const senderPhoto = senderData.photoURL || '';
    
    let preview = newMsg.text || '📎 File';
    if (newMsg.imageUrl) preview = '📷 Image';
    if (newMsg.videoUrl) preview = '🎥 Video';
    if (newMsg.audioUrl) preview = '🎤 Voice';
    if (preview.length > 80) preview = preview.substring(0, 80) + '...';
    
    const payload = {
      app_id: ONESIGNAL_APP_ID,
      include_player_ids: [oneSignalId],
      headings: { en: senderName },
      contents: { en: preview },
      data: {
        senderId: senderId,
        chatId: context.params.chatId,
        url: `messages.html?user=${senderId}`
      },
      chrome_web_icon: senderPhoto || undefined,
      priority: 10
    };
    
    try {
      const response = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      console.log('📤 Push sent:', result);
      return result;
    } catch (err) {
      console.error('❌ Push error:', err);
      return null;
    }
  });