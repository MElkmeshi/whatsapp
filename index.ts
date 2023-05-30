import NodeCache from 'node-cache'
import { Boom } from '@hapi/boom'
import makeWASocket, {  AnyMessageContent, delay, DisconnectReason,fetchLatestBaileysVersion, getAggregateVotesInPollMessage, makeCacheableSignalKeyStore, makeInMemoryStore, proto, useMultiFileAuthState, WAMessageContent, WAMessageKey } from '@whiskeysockets/baileys'
import express from 'express';
import P  from 'pino';
const msgRetryCounterCache = new NodeCache()
const logger = P({ level: 'silent' })
const store = makeInMemoryStore({ logger });
store?.readFromFile('./baileys_store_multi.json')
// save every 10s
setInterval(() => {
	store?.writeToFile('./baileys_store_multi.json')
}, 10_000)

const startSock = async () => {
	const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info')
	// fetch latest version of WA Web
	const { version, isLatest } = await fetchLatestBaileysVersion()
	console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`)

	const sock = makeWASocket({
		version,
		logger,
		printQRInTerminal: true,
		auth: {
			creds: state.creds,
			/** caching makes the store faster to send/recv messages */
			keys: makeCacheableSignalKeyStore(state.keys, logger),
		},
		msgRetryCounterCache,
		generateHighQualityLinkPreview: true,
		// ignore all broadcast messages -- to receive the same
		// comment the line below out
		// shouldIgnoreJid: jid => isJidBroadcast(jid),
		// implement to handle retries & poll updates
		getMessage,
	})

	store?.bind(sock.ev)

	const sendMessageWTyping = async (msg: AnyMessageContent, jid: string) => {
		await sock.presenceSubscribe(jid)
		await delay(500)

		await sock.sendPresenceUpdate('composing', jid)
		await delay(2000)

		await sock.sendPresenceUpdate('paused', jid)

		await sock.sendMessage(jid, msg)
	}

	// the process function lets you process all events that just occurred
	// efficiently in a batch
	// sock.ev.process(
	// 	// events is a map for event name => event data
	// 	async (events) => {
	// 		// something about the connection changed
	// 		// maybe it closed, or we received all offline message or connection opened
	// 		if (events['connection.update']) {
	// 			const update = events['connection.update']
	// 			const { connection, lastDisconnect } = update
	// 			if (connection === 'close') {
	// 				// reconnect if not logged out
	// 				if ((lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut) {
	// 					startSock()
	// 				} else {
	// 					console.log('Connection closed. You are logged out.')
	// 				}
	// 			}

	// 			console.log('connection update', update)
	// 		}

	// 		// credentials updated -- save them
	// 		if (events['creds.update']) {
	// 			await saveCreds()
	// 		}

	// 		if (events['labels.association']) {
	// 			console.log(events['labels.association'])
	// 		}


	// 		if (events['labels.edit']) {
	// 			console.log(events['labels.edit'])
	// 		}

	// 		if (events.call) {
	// 			console.log('recv call event', events.call)
	// 		}

	// 		// history received
	// 		if (events['messaging-history.set']) {
	// 			const { chats, contacts, messages, isLatest } = events['messaging-history.set']
	// 			console.log(`recv ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (is latest: ${isLatest})`)
	// 		}

	// 		// received a new message
	// 		// if (events['messages.upsert']) {
	// 		// 	const upsert = events['messages.upsert']
	// 		// 	console.log('recv messages ', JSON.stringify(upsert, undefined, 2))

	// 		// 	if (upsert.type === 'notify') {
	// 		// 		for (const msg of upsert.messages) {
	// 		// 			if (!msg.key.fromMe) {
	// 		// 				console.log('replying to', msg.key.remoteJid)
	// 		// 				await sock!.readMessages([msg.key])
	// 		// 				console.log('read messages')
	// 		// 				console.log('read messages')
	// 		// 				console.log('read messages')
	// 		// 				console.log('read messages')
	// 		// 				console.log(msg)
	// 		// 				console.log('read messages')
	// 		// 				console.log('read messages')
	// 		// 				console.log('read messages')
	// 		// 				console.log('read messages')
	// 		// 				console.log('read messages')
	// 		// 				console.log('read messages')
	// 		// 				console.log('read messages')
	// 		// 				await sendMessageWTyping({ text: 'Hello there!' }, msg.key.remoteJid!)
	// 		// 			}
	// 		// 		}
	// 		// 	}
	// 		// }

	// 		// messages updated like status delivered, message deleted etc.
	// 		if (events['messages.update']) {
	// 			console.log(
	// 				JSON.stringify(events['messages.update'], undefined, 2)
	// 			)

	// 			for (const { key, update } of events['messages.update']) {
	// 				if (update.pollUpdates) {
	// 					const pollCreation = await getMessage(key)
	// 					if (pollCreation) {
	// 						console.log(
	// 							'got poll update, aggregation: ',
	// 							getAggregateVotesInPollMessage({
	// 								message: pollCreation,
	// 								pollUpdates: update.pollUpdates,
	// 							})
	// 						)
	// 					}
	// 				}
	// 			}
	// 		}

	// 		if (events['message-receipt.update']) {
	// 			console.log(events['message-receipt.update'])
	// 		}

	// 		if (events['messages.reaction']) {
	// 			console.log(events['messages.reaction'])
	// 		}

	// 		if (events['presence.update']) {
	// 			console.log(events['presence.update'])
	// 		}

	// 		if (events['chats.update']) {
	// 			console.log(events['chats.update'])
	// 		}

	// 		if (events['contacts.update']) {
	// 			for (const contact of events['contacts.update']) {
	// 				if (typeof contact.imgUrl !== 'undefined') {
	// 					const newUrl = contact.imgUrl === null
	// 						? null
	// 						: await sock!.profilePictureUrl(contact.id!).catch(() => null)
	// 					console.log(
	// 						`contact ${contact.id} has a new profile pic: ${newUrl}`,
	// 					)
	// 				}
	// 			}
	// 		}

	// 		if (events['chats.delete']) {
	// 			console.log('chats deleted ', events['chats.delete'])
	// 		}
	// 	}
	// )

	return sock

	async function getMessage(key: WAMessageKey): Promise<WAMessageContent | undefined> {
		if (store) {
			const msg = await store.loadMessage(key.remoteJid!, key.id!)
			return msg?.message || undefined
		}

		// only if store is present
		return proto.Message.fromObject({})
	}
}

let sock: any = null;
startSock()
	.then(connection => {
		sock = connection;
	})
	.catch(err => {
		console.error("Failed to start the WhatsApp connection", err);
	});

const askeri = '218911779014@s.whatsapp.net';
const port = 3000;
const app = express();
app.get("/message/:message", async (req, res) => {
	if (!sock) {
		return res.status(500).json({ message: 'WhatsApp connection not established.' });
	}
	try {
		await sock.sendMessage("218910441322@s.whatsapp.net", { text: req.params.message });
		const on =await sock.onWhatsApp("21891044132212@s.whatsapp.net")
		res.status(200).json({ message: 'Message sent.', on});
	} catch (err) {
		res.status(500).json({ message: 'Failed to send the message.', error: String(err) });
	}
})

app.get("/g", async function (req, res) {
	console.log(sock);
	if (!sock) {
		return res.status(500).json({ message: 'WhatsApp connection not established.' });
	}
	try {
		const group = await sock.groupCreate("My First Group", [askeri]);
		sock.sendMessage(group.id, { text: '@218911779014 hello عسكري', mentions: [askeri] });
		console.log(group.id);
		res.status(200).json({ message: 'Message sent.' });
	} catch (err) {
		res.status(500).json({ message: 'Failed to send the message.', error: String(err) });
	}
})

app.get("/test", async (req, res) => {
	console.log(sock);
	if (!sock) {
		return res.status(500).json({ message: 'WhatsApp connection not established.' });
	}
	try {
		const id = "120363140515695891@g.us";
		const sentMsg1 = await sock.sendMessage(id, { text: 'oh hello there' })
		// send a reply messagge
		const sentMsg2 = await sock.sendMessage(id, { text: 'oh hello there' }, { quoted: sentMsg1 })
		// send a mentions message
		const sentMsg3 = await sock.sendMessage(id, { text: '@hi', mentions: [askeri] })
		// send a location!
		const sentMsg4 = await sock.sendMessage(
			id,
			{ location: { degreesLatitude: 24.121231, degreesLongitude: 55.1121221 } }
		)
		// send a contact!
		const vcard = 'BEGIN:VCARD\n' // metadata of the contact card
			+ 'VERSION:3.0\n'
			+ 'FN:Jeff Singh\n' // full name
			+ 'ORG:Ashoka Uni;\n' // the organization of the contact
			+ 'TEL;type=CELL;type=VOICE;waid=911234567890:+91 12345 67890\n' // WhatsApp ID + phone number
			+ 'END:VCARD'
		const sentMsg5 = await sock.sendMessage(
			id,
			{
				contacts: {
					displayName: 'Jeff',
					contacts: [{ vcard }]
				}
			}
		)

		// send a buttons message!
		const buttons = [
			{ buttonId: 'id1', buttonText: { displayText: 'Button 1' }, type: 1 },
			{ buttonId: 'id2', buttonText: { displayText: 'Button 2' }, type: 1 },
			{ buttonId: 'id3', buttonText: { displayText: 'Button 3' }, type: 1 }
		]

		const buttonMessage = {
			text: "Hi it's button message",
			footer: 'Hello World',
			buttons: buttons,
			headerType: 1
		}

		const sendMsg6 = await sock.sendMessage(id, buttonMessage)

		//send a template message!
		const templateButtons = [
			{ index: 1, urlButton: { displayText: '⭐ Star Baileys on GitHub!', url: 'https://github.com/adiwajshing/Baileys' } },
			{ index: 2, callButton: { displayText: 'Call me!', phoneNumber: '+1 (234) 5678-901' } },
			{ index: 3, quickReplyButton: { displayText: 'This is a reply, just like normal buttons!', id: 'id-like-buttons-message' } },
		]

		const templateMessage = {
			text: "Hi it's a template message",
			footer: 'Hello World',
			templateButtons: templateButtons
		}

		const sendMsg7 = await sock.sendMessage(id, templateMessage)

		// send a list message!
		const sections = [
			{
				title: "Section 1",
				rows: [
					{ title: "Option 1", rowId: "option1" },
					{ title: "Option 2", rowId: "option2", description: "This is a description" }
				]
			},
			{
				title: "Section 2",
				rows: [
					{ title: "Option 3", rowId: "option3" },
					{ title: "Option 4", rowId: "option4", description: "This is a description V2" }
				]
			},
		]

		const listMessage = {
			text: "This is a list",
			footer: "nice footer, link: https://google.com",
			title: "Amazing boldfaced list title",
			buttonText: "Required, text on the button to view the list",
			sections
		}

		const sendMsg8 = await sock.sendMessage(id, listMessage)

		const reactionMessage = {
			react: {
				text: "💖", // use an empty string to remove the reaction
				key: sentMsg1.key
			}
		}

		const sendMsg = await sock.sendMessage(id, reactionMessage)
		res.status(200).json({ message: 'Message sent.' });
	} catch (err) {
		res.status(500).json({ message: 'Failed to send the message.', error: String(err) });
	}
})
app.get("/template", async (req, res) => {
	console.log(sock);
	if (!sock) {
		return res.status(500).json({ message: 'WhatsApp connection not established.' });
	}
	try {
		const id = "120363140515695891@g.us";
		res.status(200).json({ message: 'Message sent.' });
	} catch (err) {
		res.status(500).json({ message: 'Failed to send the message.', error: String(err) });
	}
})
app.listen(port, () => {
	console.log(`Server running at http://localhost:${port}`);
});