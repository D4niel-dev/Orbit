window.Changelog = {
  show() {
    if (this._overlay) return;
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) window.Changelog.close(); });

    var modal = document.createElement('div');
    modal.style.cssText = 'background:var(--bg-surface);border-radius:var(--radius-lg);padding:24px;max-width:540px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:var(--shadow-xl);border:1px solid var(--border-subtle);';

    modal.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
        '<h2 style="margin:0;font-size:18px;font-weight:700;color:var(--text-primary);">What\'s New</h2>' +
        '<button id="changelog-close" style="background:transparent;border:none;cursor:pointer;color:var(--text-secondary);padding:4px;"><i data-lucide="x" style="width:20px;height:20px;"></i></button>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:20px;">' +
                versionBlock('0.9.0-beta', 'Stable', [
          ['New', [
            'A new look for the desktop — Settings, Advanced, Experimental Features, then "New look". It confirms and restarts, and the original UI is still what the app opens on.',
            'The settings modal and the Activity Center are rebuilt. Both were written entirely in inline styles, so nothing else could reach them.',
            'The profile sidebar has a real banner. It used to render as a 319 by 0 box.',
            'The gallery shares one shell with the rest of the app, and its view switcher works — it had been doing nothing.',
            'The call screen has a surface of its own. It was a dimmed app with text on it, so 15% of whatever chat was open showed through and the caller\u2019s name sat on top of the messages behind it.',
            'The boot skeleton matches the real chrome, so the app no longer redraws itself a size larger the moment it finishes loading.',
            'The settings nav has icons and collapses to a 64px rail, and remembers it.',
            'Presence is a shape, not just a colour — online, away, busy and offline are four distinct silhouettes.',
            'The emoji picker is Orbit\u2019s own: it hangs off the message box, exactly as wide as it, with search, nine categories, frequently-used and skin tones, and an emoji lands where your cursor is.',
            'The emoji dataset ships with the app, so a fresh install has emoji with no network.',
            'Add a Friend shows your own address — masked until you ask, with copy doing the work — and takes host:port.',
            'Classic Bubbles, from the phone: your own messages fill with the accent instead of being tinted.',
            'A restart warns you when a call is live, before the click rather than after it.',
          ]],
          ['Improved', [
            'One corner radius and one shadow across every panel — corners had drifted to four values, and the shadow token was missing from half the themes, which silently dropped every shadow drawn from it.',
            'The welcome tour shows what it describes: the file-sharing step opens a conversation, and the privacy step rings the whole setting card.',
            'The voice recorder bar and the reaction pills use the theme tokens now, instead of hardcoded colours — including a red glow that ignored every theme.',
            'Prism and the emoji picker are off the startup path, and the welcome screen no longer stutters the sidebar.',
          ]],
          ['Fixes', [
            'The emoji button did nothing in both UIs: opening the picker swapped the icon the click had started on, so the target was detached by the time the click arrived.',
            'The settings rail toggle repainted the whole app, because collapsing a rail was being written as a settings change.',
            'The emoji picker was light-scheme on eight of ten themes.',
            'Two side panels sat on top of the chat\u2019s own menu button, its toggle and Send.',
            'The settings nav lost every icon on any re-render, and the context menu closed itself after 1.5 seconds.',
            'The search field drew a box inside its own pill.',
            'The default avatar was the app\u2019s one non-accent disc, and a second had been tinted to 14% — invisible against both surfaces it straddled.',
            'The away glyph was a blob, and the redesign\u2019s presence badge was 22px where the rest are 15px.',
            'The classic group info modal had two unstyled elements.',
            'The gap between a message\u2019s text and its attachments was zero.',
            'Messages rendered through a stale copy of the sanitiser, so an @handle inside a URL matched and the replacement landed inside the href.',
            'A group\u2019s custom avatar was lost on restart.',
            'The global gallery was unstyled in the original UI.',
          ]],
          ['Version', [
            'Version: Bumped to v0.9.0-beta.'
          ]]
        ]) +
versionBlock('0.8.7-beta', '', [
          ['New', [
            'The "+" opens one sheet now — a media panel with a Photos, Poll, Commands and Files pill row along the bottom. Upload Images and Upload Videos were the same intent split in two; the picker decides between an image and a video.',
            'Orbit asks for permissions once, at startup — only for the ones that are actually missing, once per version. If everything is already granted it does nothing at all, and it no longer opens the camera on every launch just to provoke the dialog.',
          ]],
          ['Improved', [
            'The Local Vault’s "Restore From a Backup File" row moved above the Export and Restore buttons. It is not an action on this vault — it is the recovery path for one that is already gone.',
          ]],
          ['Fixes', [
            'A dismissed link preview stayed dismissed for the whole session. Dismiss the bar for a link, then paste that same link back, and nothing appears — which is the one moment a preview is actually wanted.',
            'The three-dots button on a contact opened a sheet with nothing in it but Cancel. A contact’s actions are user actions, and there is already a sheet for those.',
            'The contacts grid was wider than the screen. One long name widened its column, giving 426px of grid on a 390px phone with the right-hand cards cut off.',
            'On the desktop, a re-render made staged attachments vanish. The strip was rebuilt empty and hidden and nothing put the files back, so they were still staged and would still be sent, but you could no longer see or remove them.',
          ]],
          ['Version', [
            'Version: Bumped to v0.8.7-beta.'
          ]]
        ]) +
        versionBlock('0.8.6-beta', '', [
          ['New', [
            'Restore from a backup file. The Local Vault now finds .orzip and .zip backups in this app\u2019s folder and in vault/ \u2014 the files that survive deleting the app \u2014 and adds the account alongside what is already here rather than over it.',
            'Link previews while you type. The bar used to appear only after the message had gone, which is the one moment a preview is useless.',
            'The link card inside a sent message shows the page\u2019s own title and image now. It used to print the domain twice \u2014 as the title, and then the full URL underneath it.',
            'Contacts gained filters \u2014 All, Online, Offline, Groups, each with a live count \u2014 and a display style: a dense list, or a grid of large avatars.',
            'Every contact row has its actions now. Groups had none at all before this \u2014 a group was a row you could only tap.',
            'The attachment preview was rebuilt. A staged image used to be an empty box until it decoded; there is a spinner now, an \u00d7 on each one to take it out of the send, and tapping an image looks at it full screen instead of sending it.',
            'Only the active tab keeps its label. Three labels you are not on is three words competing for a 62px bar.',
          ]],
          ['Fixes', [
            'An emoji picked from the picker could not be sent. It was not the empty-check \u2014 an emoji passes that. The picker set the input\u2019s value directly, and assigning .value fires no input event, so the send button never appeared and the composer kept showing the mic.',
            'Tapping \u201cPair a desktop\u201d no longer re-opens the profile card on top of the camera.',
            'The restore button had no corner radius at all \u2014 it was written against a token this app does not define, and an undefined var() is dropped silently.',
          ]],
          ['Version', [
            'Version: Bumped to v0.8.6-beta.'
          ]]
        ]) +
        versionBlock('0.8.5-beta', '', [
          ['New', [
            'Orbit is in the Android share sheet. Share a photo, a video, a PDF or a link from any app and it asks which chat \u2014 sharing to the wrong person is worse than one extra tap, and "send to the last chat" is exactly the helpfulness that sends a photo to the wrong person.',
            'A notification can be answered without opening the app. Direct messages get a Reply box. Replies typed while Orbit is closed are queued and sent when you next open it, and the notification stays until then rather than pretending.',
            'App Lock: a PIN in front of the app, six digits on a keypad. Stored as a PBKDF2 hash, five wrong tries starts a 30-second cooldown that survives a restart. Locks on launch always, and on return only if you ask.',
            'Link previews. The old card showed the domain, which tells you nothing you could not read off the URL \u2014 it fetches the page and shows its own title and image now, for the most recent link in the chat.',
            'The image viewer grew up: previous/next through the images of the message you tapped, zoom by button or pinch, and a download button. At the ends the arrows go dead but stay put, so nothing shifts under your thumb mid-tap.',
            'The network map shows faces instead of letters.',
            'Undo send \u2014 a real retraction, not a local hide: it tells the other side too, so the message is gone for them as well. Off by default, in Settings \u203a Chat.',
          ]],
          ['Improved', [
            'The update download is a bottom sheet with states that change. It used to be a centred modal that said "Downloading Orbit\u2026" even while it was installing.',
            'The Local Vault\u2019s file note is the third line of its card now, instead of a stray block floating below it.',
          ]],
          ['Fixes', [
            'The What\u2019s New button did nothing \u2014 a docs edit had broken both hardcoded blocks behind it.',
            'The image viewer\u2019s prev/next arrows were never styled at all: the rules were written against a class the buttons did not have, so not one matched and they fell back to the browser default. They match the desktop\u2019s now.',
            'The viewer\u2019s backdrop was 92% opaque, so the chat behind showed through as blocks and read as a second image.',
          ]],
          ['Version', [
            'Version: Bumped to v0.8.5-beta.'
          ]]
        ]) +
        versionBlock('0.8.4-beta', '', [
          ['Fixes', [
            'A group of images of different sizes no longer goes ragged. The grid follows Discord now: one image keeps its own proportions, two are a pair of squares, three are one large square with two stacked beside it, four are a 2x2, and anything past four shows four tiles with a +N on the last.',
            'One tap on Send was also starting the mic. Sending swaps the composer from the send button to the mic, and Android fires a synthetic mouse event right after a touch aimed at whatever is under your finger by then \u2014 so it landed on the mic, started a recording, and the release sent it. One tap, a voice message nobody asked for, on repeat.',
            'That is also why the send button looked wrong and never lit up: the swap had already run, so the composer was showing the mic.',
            'And on the desktop, images in a grid were rendering at half height \u2014 the grid\u2019s own rules lost a specificity tie, so a wide photo sat at its natural height inside a square tile.',
          ]],
          ['Version', [
            'Version: Bumped to v0.8.4-beta.'
          ]]
        ]) +
        versionBlock('0.8.3-beta', '', [
          ['New', [
            'The conversation screen, reworked. A message was one box with everything crammed inside it — text, images, files, video, audio. Now each kind gets the treatment its content actually wants: text keeps its bubble, images lose theirs and keep their real proportions instead of being squared and cropped, files get a surface of their own, and video and audio float on a shadow.',
            'Every file draws its own icon. A .zip, a .json and a .pdf used to be a column of identical glyphs.',
            'Your own messages are no longer a block of colour. Same surface as everyone else’s, with the corner saying which side you are on — and a Classic Bubbles toggle in Chat settings if you want the old look back.',
            'The desktop got the same treatment, so both platforms lay a conversation out the same way.',
            'The Local Vault fits the rest of Settings now, with Export and Restore told apart instead of both shouting equally.',
            'Reactions straddle the bubble’s edge, and the bottom sheets lost their duplicate ×.',
          ]],
          ['Fixes', [
            'The message bubbles were hardcoded to a fixed dark and a fixed blue. In a light theme the incoming bubble stayed dark while the text went dark with the rest of the app, so the message vanished into its own bubble. They follow the theme now — 17.3:1 contrast in dark, 17.8:1 in light.',
            'The small × on every staged attachment is gone, and so is the one in the top-right of every sheet. The Cancel button clears them, and two controls for one job just meant the smaller, harder-to-hit one.',
          ]],
          ['Version', [
            'Version: Bumped to v0.8.3-beta.'
          ]]
        ]) +
        versionBlock('0.8.2-beta', '', [
          ['New', [
            'Diagnostics, rebuilt. It used to be a row of bare checks floating on the background with the top third of the screen empty. It opens with a verdict now \u2014 "Everything checks out", or what needs a look \u2014 and the report you would paste into a bug report is shown on screen instead of only promised.'
          ]],
          ['Fixes', [
            'The contacts list kept changing its mind. It rendered grouped \u2014 Online, Offline, Groups \u2014 and then flipped to a plain flat list on almost any update, including typing in the search box. Two renderers were writing to the same list and the older one was winning.',
            'The Friends / Groups tabs were invisible unless you had already created a folder. If you never made one, the control that switches between them was simply not there.',
            'Custom profile banners had stopped showing. Your banner image was still saved and still set \u2014 it just was not being drawn, and the card looked deliberate without it.'
          ]],
          ['Version', [
            'Version: Bumped to v0.8.2-beta.'
          ]]
        ]) +
        versionBlock('0.8.1-beta', '', [
          ['New', [
            'Link a phone. Open it from the account switcher, scan the code on your phone, and your account comes across your own network \u2014 encrypted, and imported as a second account rather than overwriting the one already there.',
            'The code that authorises it is shown only on this screen and never sent in the clear. Nothing leaves the machine until you confirm, and the confirmation says what is about to go and how much of it.',
            'Search now spans everything. It used to find nothing outside the conversation you had open \u2014 searching a word that appears in three chats returned zero results.'
          ]],
          ['Fixes', [
            'The settings search marked nine of ten rows as hidden and left every one of them on screen. It had been broken since the restyle, and a search that does nothing looks exactly like a search with no results.',
            'The Activity title sat 20px left of centre.',
            'The navbar no longer moves when you change tabs.',
            'Switching accounts could take the wrong settings with it, and a profile frame could follow you across a switch.'
          ]],
          ['Version', [
            'Version: Bumped to v0.8.1-beta.'
          ]]
        ]) +
        versionBlock('0.8.0-beta', 'Stable', [
          ['New', [
            'Your theme follows you to your phone. Change it on the desktop and it reaches your own devices \u2014 including a custom theme\u2019s colours, which is the part that actually is the theme.',
            'Message search now runs on SQLite\u2019s full-text index. "project AND deadline" is answered by the database in milliseconds however much history you have, with prefix matching, relevance ranking, and an option to search just one chat.',
            'A search icon inside the Shared Media search bar.'
          ]],
          ['Fixes', [
            'The update progress bar actually moves. It had no total to divide by, so it sat at 0% while the label counted megabytes.',
            'A custom theme\u2019s colours now reach your phone. The colour editor saves differently from everything else, and the broadcast never fired for it.',
            'The Images tab shows images. Video and audio were landing there, where their thumbnails cannot load.',
            'Changing the display no longer refreshes the whole window.',
            'Opening the gallery closes the Shared Media panel, instead of showing two galleries at once.',
            'Select mode has a visible way out, and long filenames truncate instead of spilling over the next card.',
            'The send button can no longer leave you stuck: it shows when it can send, but a re-render can never leave it inert with no way forward.',
            'A toast arriving as you went to send used to swallow the click. The stack now clears the composer.'
          ]],
          ['Version', [
            'Version: Bumped to v0.8.0-beta.'
          ]]
        ]) +
        versionBlock('0.7.6-beta', '', [
          ['New', [
            'Shared Media has grown up: search, filters by sender, kind and age, a grid/list toggle, jump-to-message on every item, and multi-select with download-all. It also renders 60 items at a time with a count, rather than building the whole list on every keystroke.',
            'Storage stats in the gallery header \u2014 how much your media takes and which chats it came from, biggest first. Orbit keeps your files on your own disk, so this is a fair question to ask.',
            'Select and delete media from the gallery. The confirm says plainly that the message goes for both people, because "delete" here could reasonably mean three different things.',
            'A month scrubber down the side of the gallery, so "that photo from March" is a click rather than a scroll.',
            'The composer says what it can do: the plus rotates into an \u00d7 while its menu is open, the send button lights up and fills when there is something to send, and hovering a disabled send shows a random icon.',
            'The tutorial and welcome slides animate their parts in sequence instead of swapping all at once.'
          ]],
          ['Fixes', [
            'The Images tab was showing video and audio \u2014 and their thumbnails cannot load, so they appeared as broken images. Images means images now.',
            'Changing the display no longer refreshes the whole window. It was writing a preference through the store, which every part of the app listens to.',
            'Opening the gallery closes the Shared Media panel, instead of showing two galleries at once.',
            'Select mode has a visible way out, even before you pick anything.',
            'Long filenames truncate in their cards instead of spilling over the next one.',
            'The filled emoji icon was a solid blue disc with no face in it. It is the accent colour now.'
          ]],
          ['Version', [
            'Version: Bumped to v0.7.6-beta.'
          ]]
        ]) +
        versionBlock('0.7.5-beta', '', [
          ['New', [
            '55 profile frames, up from 43 \u2014 and the picker now shows the frames that actually exist, so a missing file can never leave a broken tile.',
            'Copy your user ID from your profile, and a setting for whether a group\'s info shows when it was created.',
            'A group with no recorded date no longer says "Created Unknown" \u2014 the row is simply gone.'
          ]],
          ['Fixes', [
            'The pinned messages bar and its list are new in this release, so most of the work here was on the shared bottom sheet they use.',
            'A sheet that opens off the bottom of the screen now says so instead of failing silently.'
          ]],
          ['Version', [
            'Version: Bumped to v0.7.5-beta.'
          ]]
        ]) +
        versionBlock('0.7.4-beta', '', [
          ['Updates', [
            'Downloading an update shows a progress bar and the time remaining, instead of a percentage that vanished the moment the button said "Opening installer".',
            'The estimate is held back for the first second and a half: the first chunk measures the round trip rather than the throughput, and a number that starts at "2m left" and settles on "20s left" is worse than no number.'
          ]],
          ['Technical', [
            'The rules deciding which hosts the updater will download from, and what filename it writes, were closures inside the IPC handler \u2014 unreachable from any test. They live in desktop/lib/update-assets.js now and are covered, including the redirect host GitHub sends release assets to.'
          ]],
          ['Pinned messages', [
            'Pin up to three messages in a direct message, five in a group. A card at the top of the conversation shows the top pin and the count.',
            'Click it to jump to that message, or right-click it for a floating list. Reordering is saved, and the chat is told about it.',
            'A pinned file is named by its file name now, and a deleted message leaves the list at once.'
          ]],
          ['Version', [
            'Version: Bumped to v0.7.4-beta.'
          ]]
        ]) +
        versionBlock('0.7.3-beta', '', [
          ['Custom Colors', [
            'Every colour token the themes define is editable now \u2014 the editor used to offer 13 of 21, and the one that mattered was the text colour on an accent background, so a light custom accent left unreadable text.',
            'Each row has a real colour picker beside its hex field, and a value that is not a colour is refused instead of applied.',
            'There is a way back to your saved colours. Applying set the theme to your custom one, but nothing in the theme list offered it, so picking any other theme dropped you out with no route home.'
          ]],
          ['Emoji Picker', [
            'It wears the app\u2019s theme now instead of the library\u2019s raw defaults \u2014 no more stray hairline or white focus box.',
            'Your skin tone is remembered between sessions.',
            'The last column is no longer hidden behind the scrollbar on Windows.'
          ]],
          ['Messages', [
            'An unsent message stays in its chat until you send it, and sending ends the draft. Drafts used to come back after you had sent the message.',
            'The "no messages yet" placeholder sits in the middle of the conversation rather than at the top.'
          ]],
          ['Groups', [
            'Group info says how many members are online and when the group was created.',
            'The owner has a Danger Zone now. Deleting your own group used to live only in the right-click menu.'
          ]],
          ['Note', [
            'Settings sync \u2014 carrying a custom theme between your own devices \u2014 is groundwork in this release: the packet type and the validated rules are in, but nothing sends or receives yet, so it does not work end to end. The transport is next.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.7.3-beta.'
          ]]
        ]) +
        versionBlock('0.7.2-beta', '', [
          ['Welcome Tour', [
            'The feature tour has atmosphere now: a slow aurora behind a frosted-glass card, with each slide animating in \u2014 icon first, then the title, then the text.',
            'It starts at the first slide every time you open the app. It used to resume wherever you left off, and clicking Done only lasted until the next redraw.',
            'The second slide used to claim Orbit warns you if someone\u2019s key changes. It does not yet \u2014 that promise is gone, and the gap is stated plainly on the website instead.'
          ]],
          ['Look & Feel', [
            'Every empty screen \u2014 the chat panel, an empty conversation, the friends and groups lists, search \u2014 now shares one treatment: a soft glowing icon, a title, and a line telling you what to do next.',
            'The Next button in light mode is readable on hover again. It was white text on a pale background.'
          ]],
          ['Also in this release', [
            'On Android: the /help list opens full-screen over the keyboard and scrolls properly, the emoji picker no longer shows a stray "undefined", and an update download is checked before Android is asked to install it.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.7.2-beta.'
          ]]
        ]) +
        versionBlock('0.7.1-beta', '', [
          ['Note', [
            'This one is a mobile-only patch: the /help sheet, the emoji picker and list dragging were all phone-side, and nothing changed on desktop. It is here so the version you are running has an entry.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.7.1-beta.'
          ]]
        ]) +
        versionBlock('0.7.0-beta', '', [
          ['Messaging', [
            'Closing a DM no longer deletes the conversation. It used to wipe the messages and the pins out of the chat it was closing \u2014 now it only hides the DM, and the history is exactly where you left it.',
            'Orbit Echo can no longer be closed. It is the one DM that is always available, and closing it used to remove it for good with no way back.'
          ]],
          ['Friends', [
            'An All friends button in the Friends header opens a directory of everyone \u2014 friends who are offline, and DMs you have closed, which you can reopen with one click. Search it, filter it (All / Online / Offline / Closed), and switch between a list and a grid.'
          ]],
          ['Chat Commands', [
            'The /help list opens nearly full-screen and shows ten commands at once instead of three, with a scroll indicator so it is obvious there is more.'
          ]],
          ['Notifications', [
            'Notifications use the Orbit icon now, so a glance at the corner tells you which app it came from.'
          ]],
          ['Look & Feel', [
            'Orbit opens on its feature tour instead of jumping straight into your last conversation.',
            'The people icons are the rounded variants now.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.7.0-beta.'
          ]]
        ]) +
        versionBlock('0.6.5-beta', '', [
          ['Updates', [
            'Orbit downloads the update for you now. Instead of handing the installer to your browser, it fetches it into your Downloads folder, shows progress (with a cancel), checks it against the checksum published with the release, and then offers Open installer or Show in folder. If the file does not match the published checksum it is deleted rather than left on your disk. Nothing installs itself \u2014 these are unsigned builds, so you still run the installer \u2014 and the update notice also picks the right file for your machine now (an Intel Mac used to be offered the Apple-silicon build).'
          ]],
          ['Audio & Video', [
            'A playing player no longer escapes its message when you switch chats. If you left a chat mid-playback, the player was dumped into whatever chat you opened next as a bare block outside any bubble \u2014 and it could never find its way back to its own message, in any chat. It stays with its message now and picks up where it left off when you return.'
          ]],
          ['Platform Note', [
            'The rest of this release is mobile: a close button and a draggable body for the /help sheet, and a grab handle with swipe-to-dismiss on the emoji picker.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.6.5-beta.'
          ]]
        ]) +
        versionBlock('0.6.4-beta', '', [
          ['Audio', [
            'The audio visualiser now draws the track\u2019s real waveform \u2014 fetched and decoded once per file, cached so re-renders never re-decode. Oversized files fall back to a flat row. The \u2630 menu lets you switch between Bars, Wave, and Off; "Off" used to show nothing and now shows the same decoded shape.',
            'The file name sits above the timer, with the volume icon at the right end of the progress bar. Click the icon for a slider popover; click outside or finish dragging to dismiss it. The icon doubles as a level meter: crossed out when muted or at 0%, one wave at 1\u201350%, two waves above 50%.'
          ]],
          ['Onboarding', [
            'The chat panel\u2019s empty state shows a 7-slide tour of what Orbit does \u2014 networking, encryption, media, calls, groups, storage, theming. Dots and Back/Next, arrow keys, position remembered. "Done" collapses to the plain empty state.'
          ]],
          ['Fixed', [
            'An unplayed audio bubble was a large blank rectangle. It now shows the track\u2019s real waveform in the Bars and Off modes, and the resting bar row in the Wave mode.',
            'The audio draw loop used to spin forever after pause \u2014 a player that had ever been played held a 60fps callback alive for the rest of its life. It stops on pause and restarts on play.',
            'Release checksums for macOS and Linux carried a "dist/" path prefix in the filename, so "sha256sum --check SHA256SUMS.txt --ignore-missing" silently skipped them \u2014 your download was never actually verified. All platforms now use the bare filename.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.6.4-beta.',
            'Mobile: removed a dead wire that looked up a non-existent button id \u2014 harmless now, but renaming the id would have double-opened the quick-add sheet.',
            'Mobile: removed a second dead wire (#btn-new-chat) that looked up a button that never existed in the HTML.'
          ]]
        ]) +
        versionBlock('0.6.3-beta', '', [
          ['File Transfer', [
            'Sending a file works now. Two separate bugs stopped it: the size constant for each piece of the file was declared in one function and used in another, so the very first send threw an error and nothing was ever sent; and attaching a file produced no message at all, because Electron 32 removed the API Orbit used to locate the file on disk, and the fallback quietly produced a filename with no folder \u2014 which cannot be opened. Both are fixed, at the file picker and the drag-and-drop target alike.'
          ]],
          ['New', [
            'Audio messages show their album art \u2014 read out of the file itself (MP3, M4A and FLAC). No cover image, and you get a music note instead.',
            'Videos show their first frame instead of a black rectangle. Press play and the preview steps aside; press Stop and it comes back.',
            'The tray menu is worth right-clicking now: copy your Orbit ID, set your status (Online, Away, Busy, Invisible) and have it reach your contacts straight away, mute notifications, check for updates, and lock Orbit if you have a PIN set. Open Orbit also brings the window back properly instead of merely showing it.',
            'Text and files sit in the same order as on mobile now \u2014 the file used to sit above the message here and below it there.'
          ]],
          ['Fixed', [
            'Audio no longer stops when a new message arrives \u2014 the player was rebuilt from scratch on every re-render and went silent.',
            'Reading a file\u2019s own data was blocked by the app\u2019s security policy, which is why album art worked on mobile but never appeared here. It also covers attachments restored from the database after a restart.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.6.3-beta.'
          ]]
        ]) +
        versionBlock('0.6.2-beta', '', [
          ['Platform Note', [
            'This is an Android fix release. Nothing changed on desktop apart from the version number.'
          ]],
          ['Fixed on Android', [
            'Notifications showed in the shade with nothing beside the clock. The icons were invalid rather than missing \u2014 their paint attributes sat on a vector <group>, which only accepts transforms, so the drawable failed to load. All nine were rebuilt and checked at 24px and 72px.',
            'The in-app update check could not reach GitHub, and the fix for that briefly broke the download itself. Both are resolved: the check now goes through native networking, and the download completes whether or not the response can be streamed.'
          ]]
        ]) +
        versionBlock('0.6.1-beta', '', [
          ['Fixed', [
            'Gallery no longer resets the sidebar \u2014 Changing the gallery display style used to snap the first sidebar button back to DMs, because the nav buttons were built from one signal that did not know about the gallery. They now follow the real state.',
            'Text and files arrive as separate messages \u2014 A message used to appear captioned "Receiving Video..." before any video had arrived. Text now lands on its own, and the file follows as its own message when the transfer actually completes.'
          ]],
          ['Platform Note', [
            'Everything else in this release is Android: the notification permission, and the memory work that stopped large transfers from exhausting the phone. Nothing else to try on desktop.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.6.1-beta across all three package.json files.',
            'Unit tests 267/267. The desktop E2E suite is unaffected by this release.'
          ]]
        ]) +
        versionBlock('0.6.0-beta', 'Stable', [
          ['Fixed', [
            'Profile Frames Sit Correctly Now — Frames were drawn at 100% of the avatar, so the wreath art hugged the edge instead of wrapping around it. They are now drawn at 125%, centred, so the artwork surrounds the avatar the way it was designed to. This was wrong on mobile too, and both platforms are now the same.'
          ]],
          ['Platform Note', [
            'Everything else in this release is Android work: system notifications, an offline send queue, the Local Vault, and updates that install from inside the app. There is nothing else new to try on desktop.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.6.0-beta across all three package.json files.',
            'Unit tests 267/267. The desktop E2E suite is 34/34 and was unaffected by this release.'
          ]]
        ]) +
        versionBlock('0.5.3-beta', '', [
          ['Features', [
            'Voice & Video Calling on Android — Android had the call protocol but no way to use it. You can now call someone directly: outgoing calls, an incoming ring you can accept or decline, mute, speaker and camera toggles, a call timer, and a picture-in-picture view of yourself. Calls work between a phone and a computer, and the signalling travels over the same encrypted connection as your messages.',
            'A Real Ringtone — Calls now ring with an actual sound for up to a minute and a half, on both desktop and Android. Desktop was completely silent before this.',
            'Call History in the Chat — Every finished call leaves a message in the conversation showing whether it was a voice or video call, how long it lasted, and a Call again button. Missed, declined and unanswered calls are recorded too.'
          ]],
          ['Bug Fixes', [
            'Encrypted Vault Export Never Worked — Turning on encryption for a Local Vault export made it fail every single time, silently, before it encrypted anything. Fixed and verified end to end.',
            'Local Vault Could Still Crash on a Big Account — The previous fix covered saved attachments but not the data left behind by interrupted file transfers, which on a busy account pushed the export to roughly 290 MB of memory. The limit now covers both, and it adjusts to the device on its own — a low-memory phone exports less rather than dying.',
            'Restoring a Vault No Longer Loads Everything at Once — Attachments are restored in small batches, so a large backup restores without running out of memory.',
            'Bottom Sheets Could Not Be Closed — The Cancel button sat at the very bottom of the scroll area on long sheets like /help, and a leftover drag could make closing stop working entirely. Both fixed, and tall sheets now scroll properly with the keyboard open.',
            'Group Avatars Match Desktop — Android was still showing a single letter for a group without a picture; it now shows the same member-avatar grid desktop does.',
            'Desktop Calls Never Gave Up — An unanswered call left you on a dead call screen indefinitely. It now gives up after the same 1m30 as the ringtone.',
            'Ringtones Stopped When Answered — Fixed before release: the ring could keep playing after the other person picked up.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.5.3-beta across all three package.json files; Android bundle resynced.',
            'Unit tests 267/267; desktop E2E suite 34/34. Calling was verified with two real peers connected to each other, and the vault with a full encrypted export-and-restore round trip.'
          ]]
        ]) +
        versionBlock('0.5.2-beta', '', [
          ['Features', [
            'Cross-Platform E2EE — Desktop now speaks the same encryption scheme as Android (SPKI keys, HKDF-SHA256, two-field envelope), so encrypted DMs finally work in both directions. The peer\'s advertised key format decides which path is used, so peers on older builds keep working. Existing desktop keypairs migrate in place with the private key preserved.',
            'QR Pairing v2 — A QR code is now a portable beacon: your identity, every LAN address, your TCP port and your public key. Desktop can scan one by pasting, dropping or choosing an image; Android uses its camera. Every invalid code explains itself instead of failing silently.',
            'In-App Update Notifications — Orbit tells you when a newer version exists, shows what changed, and hands you the right installer or APK in one click. Checked at most once every 6 hours, skippable per version, and switchable off in Settings → About.',
            'Tabbed Add-a-Friend (Desktop) — Switch between entering an IP address and pairing by QR code, with the scanner inline.'
          ]],
          ['Security', [
            'Silent E2EE Downgrade Fixed (4 sites) — A missing peer key or a failed encryption could previously send a message as plaintext while the UI still showed encryption as on; one mobile path left a message on screen that was never actually sent. Both platforms now block the send and tell you why, and mobile groups skip keyless members instead of downgrading for them.',
            'QR key pinning now works between desktop and Android, and the dead e2eeEncryptMessage() plaintext fallback was deleted.'
          ]],
          ['Bug Fixes', [
            'shared/ Was Missing From Desktop Installs — The audio player, video player and image cropper had been failing to load in every packaged build. Fixed.',
            'Local Vault No Longer Kills Android — Large exports assembled the whole blob store in memory with no limit, and an out-of-memory kill cannot be caught. Exports now stop at 32 MB and record what was left out, so a restore can explain the gap.',
            'Bottom Sheets No Longer Open Behind the Keyboard — /help, the /poll builder and folder rename were invisible on device, because Android does not shrink the viewport when the soft keyboard appears.',
            'Chat Header Keeps Up — Peer status and profile frames no longer freeze until something unrelated forces a repaint.',
            'Chat Header Profile Frames — The header was the one place frames did not render.',
            'Group Avatars No Longer Show "undefined" — Four implementations that had drifted apart are now one shared member-avatar grid.',
            'Image Cropper Is Now WYSIWYG — The export was about a third more zoomed than the preview.',
            'Group Image Upload — The create-group dialog can set a group image now.',
            'Desktop Reported the Wrong Version — Packaged builds showed a hardcoded 0.1.2-beta in Settings → About.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.5.2-beta across all three package.json files; Android bundle resynced.',
            'Unit tests 158 → 267 assertions across four suites; desktop E2E suite 9 → 34 specs. The new E2EE interop suite caught three bugs before they shipped.'
          ]]
        ]) +
        versionBlock('0.5.1-beta', '', [
          ['Bug Fixes', [
            'Stalled Transfer Recovery (Mobile + Desktop) — Interrupted receives keep their saved progress across stalls, app restarts, and crashes; late chunks resume from the checkpoint instead of restarting or vanishing.',
            '/help Now Works With Phone Keyboards — Soft keyboards that skip real Enter keydowns (IME 229 / insertLineBreak) now trigger slash commands like the send button does.'
          ]],
          ['Added', [
            '/h Shortcut — Quick alias for /help on both platforms.'
          ]]
        ]) +
        versionBlock('0.5.0-beta', 'Stable', [
          ['Features', [
            'Resumable P2P File Transfers (Desktop) — Interrupted chunked transfers resume from the last contiguous chunk via FILE_TRANSFER_RESUME and auto-resume when peers reconnect.',
            'Network Topology Visualizer (Desktop + Mobile) — Live canvas map in Settings → Network: you at the center, peers orbiting, RTT color-coded links, transfer pulses, activity flashes.',
            'Message Threading (Desktop + Mobile) — Replies persist across restarts, render as indented chains with an "N replies" chip, and open in a View thread panel.',
            'Local Vault (Mobile) — Encrypted local backup of all your data (settings, chats, messages, files) with restore picker and optional auto-backup on background.',
            'Group Slash Commands (19) — /help /poll /me /shrug /tableflip /unflip /lenny /roll /flip /spoiler /clear /invite /members /topic /leave /shout /countdown /nick /kick — group chats only. /poll opens a visual builder; quoted syntax still works.'
          ]],
          ['Bug Fixes', [
            '/help Now Works on Mobile — Hardened sheet access plus a cache-bust fixed the dead command in group chats.',
            'Slash Commands Come to Desktop — Full parity with mobile, gated to groups.',
            'Poll Builder Centered — The create-poll sheet (plus invite/members sheets) is now properly centered.',
            'Invite Share Fixed — Group Info Share now uses the system share sheet (or copies invite text) instead of posting into whatever chat was open.',
            'Music Visualizer Duration Line Matches Video Player — Seek bar, groove, fill, and tooltip styles harmonized.'
          ]],
          ['Technical', [
            'Version bumped to v0.5.0-beta across all manifests; Android bundle resynced.'
          ]]
        ]) +
        versionBlock('0.4.2-beta', '', [
          ['Features', [
            'Chat Folders (Desktop, Experimental) — New Folders rail in the sidebar, gated behind Settings → Advanced → Enable Experimental + the new "Chat Folders" toggle. Create/rename/delete folders, add friends and groups via the chat context menu, browse a folder\'s chats in a dedicated view, and bulk-assign chats with the "Add Chats" picker. Folders persist per-device (local only; no sync yet).',
            'Folder Tabs Polish (Mobile) — Home-screen folder tabs redesigned: uniform tab width, centered Friends/Groups/folder trio when you have a single folder, and a dedicated scrollable sub-rail when you have several. Folders no longer draw opaque backgrounds over the panel; the active-tab underline is centered and new folders auto-scroll into view.'
          ]],
          ['Bug Fixes', [
            'Deleting a Folder No Longer Crashes the App — Settings notifications are now isolated per listener, the confirm dialog always closes (try/finally), and reply-quote sender names resolve safely in group chats (the three stacked failure points behind the crash).',
            'Sidebar Rail Buttons Work Again After a Settings Change — The Folders, DMs, Settings, and Profile buttons were losing their listeners when the sidebar re-rendered; they are now re-attached.',
            'Folder Picker Fixed — Clicking outside now dismisses it, and clicking inside the picker no longer navigates into the folder.'
          ]],
          ['Technical', [
            'Version bumped to v0.4.2-beta across all three package.json files; version.js and the Android bundle regenerated.'
          ]]
        ]) +
        versionBlock('0.4.0-beta', 'Stable', [
          ['Bug Fixes', [
            'Message Long-Press Menu Fixed — Press-and-hold on a message bubble now opens the reactions + actions sheet (Copy/Reply/Translate/Forward/Delete). Previously the wiring only ran through a secondary code path the app no longer uses, so the menu never initialized.',
            'Profile Frame Leak Fixed (4 renderers) — Avatar frames were still rendering when the Profile Frames setting was off. Gated _addAvatarFrames, renderProfilePill, and both chat-header renderers.',
            'Experimental Toggle Off-State Bugs Fixed — Avatars / Profile Frames / Perf Mode toggles used empty-string attribute selectors that failed when off. Switched to value-based [data-*="true"] selectors.',
            'Compact Spacing Toggle Fixed — Setting wrote a class the CSS no longer matched; now uses a [data-compact-spacing] attribute selector.',
            'FPS Monitor & Dev Overlay Resume on Reload — Debug toggles no longer stay off after an app reload when enabled.'
          ]],
          ['UI Polish', [
            'Folder Tab Icons Removed — Folder tabs show clean text labels only, matching Friends/Groups.',
            'Folders Gated Behind Experimental — Folder tabs and the Folders settings entry now require the new Experimental toggle (off by default) in Settings → Experimental → Advanced.',
            'Profile Frame Icon Removed (Desktop) — Account settings "Profile Frame" collapsible header shows the title only.'
          ]],
          ['Features', [
            'Message Effects Graduated — Message Effects (particle confetti on sent messages) moved from Experimental to Chat settings, with one-time automatic migration.',
            'Profile Frames Graduated — Moved from Experimental to stable settings (Appearance on mobile, Account on desktop), on by default, with one-time automatic migration. Desktop picker no longer requires Developer Mode.'
          ]],
          ['Technical', [
            'Version bumped to v0.4.0-beta across all manifests.'
          ]]
        ]) +
        versionBlock('0.3.2-beta', '', [
          ['Bug Fixes', [
            'Profile Frames Graduated — Experimental Profile Frames feature moved to stable Account settings; no longer requires Developer Mode.',
            'Android Crash-on-Launch Fixed (3 bugs) — SplashScreen theme attributes missing (crash on cold start); registerPlugin() called after super.onCreate(); colors.xml was entirely missing — created.',
            'Profile Card Real-Time Updates Fixed (4 bugs) — Duplicate DOM IDs in profile sheet vs panel; cropped image hero preview not updating after save; avatar mistakenly used for banner background; profile pill never updated after save.',
            'Status Text Color Fixed (Profile Pill) — Status text appeared gray on startup because getStatusColor() from app.js wasn\'t loaded yet. Fixed with local statusColors map in home-screen.js renderProfilePill().',
            'Mobile Gallery Bug Fixes (7 bugs) — Null guards on gallery bindings, null checks in show/hide, blob URL memory leak, filter index mismatch, date-group visual order mismatch (wrong media opening), missing scaleIn animation, safe-area for lightbox close.'
          ]],
          ['UI Polish', [
            'Frame Picker Redesigned (Mobile) — Changed from full-screen backdrop to compact fixed-position bottom sheet (position:fixed;bottom:0;left:0;width:100%;max-height:75vh) with slideUp CSS animation, guarded by _framePickerOpen flag.',
            'Frame Preview Fixed — Removed position:absolute from frame image and overflow:hidden from container. Frame now flexbox-centered without clipping by avatar circle.',
            'Status Selection (Mobile) — New select dropdown with 4 statuses (Online/Away/DND/Offline). Saves to store and broadcasts BEACON.',
            '"Busy" Status Removed — From both mobile status selector and desktop profile-card.js.',
            'Desktop Status Icons Changed — Filled colored circles replace text indicators.'
          ]],
          ['Search Enhancement (Mobile)', [
            'Categorized Results — Search organized into Chats, Friends, Messages sections with count headers.',
            'Text Highlighting — Matched terms highlighted with accent color via _highlightText() helper.',
            'Recent Searches — Last 5 searches stored in MStore.settings.recentSearches, shown on input focus.',
            'New CSS — .search-results-* and .recent-search-* styles in mobile.css.'
          ]],
          ['Technical', [
            'Version bumped to v0.3.2-beta across all manifests.'
          ]]
        ]) +
        versionBlock('0.3.1-beta', '', [
          ['Bug Fixes', [
            'Android Immersive Mode Fixed — Taskbar now hides correctly. Root cause: Capacitor SystemBars plugin was calling show() after immersive mode. Fixed with SystemBars config, SplashScreen API, lifecycle handlers, and FLAG_FULLSCREEN for legacy API levels.',
            'Real-Time Profile Cards Fixed — Avatar/banner/bio/frame changes now propagate instantly. Desktop added broadcastBeacon IPC bridge; mobile sends BEACON on profile save; both platforms fixed null-propagation checks.',
            'DM Avatar Render Fix — No more missing avatars during rapid chat switching. closeChat/openChat race condition fixed, dm_ prefix stripped from friend lookup.',
            'Mobile Startup Performance — Lazy message loading, early-exit blob restoration, deferred cropper init.'
          ]],
          ['UI Polish', [
            'Image Cropper Redesigned — Premium look with Lucide icons, checkerboard preview, rule-of-thirds grid, corner handles, gradient Apply button, and smooth entrance animations.',
            'Smooth Zoom — Finer zoom steps (0.01 slider, 5% buttons, 2% scroll), GPU-accelerated sub-pixel positioning.',
            'Bottom Sheet Safe Area Cleaned — Removed safe-area-bottom padding from all bottom sheets.'
          ]],
          ['Technical', [
            'Version bumped to v0.3.1-beta across all manifests.',
            'Android web assets synced via npx cap sync android.'
          ]]
        ]) +
        versionBlock('0.3.0-beta', '', [
          ['Image Cropper (Desktop + Mobile)', [
            'Shared Image Cropper — New crop tool with drag, zoom (slider + pinch + wheel), rotate 90° CW/CCW, mirror, and reset. Integrated into desktop avatar/banner inputs and mobile profile sheet.',
            'Avatar Circular Crop Guide — Three-level SVG mask with dimmed corners and transparent circle for precise avatar framing.',
            'Zoom & Centering Fixes — Drag scales proportionally; image sized-to-fit (Math.min); base centering separated from user drag.'
          ]],
          ['Mobile Improvements', [
            'Gallery A/V Playback Fixed — base64→blob URL conversion in openLightbox() for native Android WebView media playback.',
            'Real-Time Profile Overlay Refresh — Beacon handlers call refreshProfileOverlay() so peer cards update instantly on friend changes.',
            'Immersive Mode — System bars auto-hide on full-screen content (Android 7+).',
            'Input Box Draft Saving — Chat drafts auto-saved to localStorage (debounced 300ms), restored on chat switch, cleared on send.'
          ]],
          ['Desktop Improvements', [
            'Real-Time Profile Card Updates — profile-card.js watches friends array; open cards re-render on beacon-driven friend changes.',
            'Receiving Audio/Video Progress — File transfers show "Receiving Audio..." or "Receiving Video..." with Lucide icons.',
            'Input Box Draft Saving — Same localStorage draft pattern, cross-session persistence.'
          ]],
          ['Release Signing & Security', [
            'GitHub Actions Release Workflow — 5 parallel build jobs (Linux/Windows/macOS/Android) + SHA256SUMS.txt + GPG signing.',
            'GPG Signing — Release artifacts verified with Orbit Release Key. Key setup docs in security/README.md.',
            'Security Policy — SECURITY.md with supported versions and vulnerability reporting.',
            'Verification Docs — README.md "Release Verification" section with copy-paste commands.'
          ]]
        ]) +
        versionBlock('0.2.8-beta', '', [

          ['Mobile A/V Persistence Fix', [
            'All Chat Pre-Loading — _restoreAllBlobAttachments now loads ALL chat messages before restoration runs.',
            'Exponential Backoff Retry — _resUrl retries 5 times instead of giving up after one attempt.',
            'Local Send Path Cleanup — Fixed attsRef pointer for large-file _blobKey tracking.',
            'FILE_TRANSFER_END _blobKey restored to synchronous save — prevents file-icon regression.'
          ]],
          ['Video Duration Fix', [
            'Backward moov scan fallback for non-faststart MP4s.',
            'Return max(mvhdDur, bestTrackDur) for fragmented MP4s.',
            'durationchange handler updates knownDuration on correction.',
            'dur() uses max(knownDuration, video.duration) safety net.'
          ]],
          ['Mobile Status Circle Fix', [
            'PONG/MESSAGE handlers update friend.lastSeen — prevents false offline display.',
            'onPeerFound sets lastSeen + triggers re-render on reconnect.'
          ]],
          ['Emoji Reaction Fix', [
            'Fixed packet.from vs packet.to swap in store.js REACTION handler — DM reactions from mobile now reach desktop.'
          ]],
          ['Video Overlay Controls Fix', [
            'touchstart handler + _touchTap guard for instant overlay on mobile tap.'
          ]],
          ['UI/UX Improvements', [
            'Code blocks redesigned with header bar, language label, and Copy button.',
            'Copy code button with clipboard API + "Copied!" feedback.',
            'Improved inline code styling with accent color border.',
            'Desktop sanitize.js synced with shared version — copy button now works on desktop too.',
            'Chat list previews cleaned — markdown syntax stripped, truncated at 80 chars.'
          ]],
          ['Technical', [
            'Version bumped to v0.2.7-beta.'
          ]]
        ]) +
        versionBlock('0.2.7-beta', 'Stable', [
          ['New', [
            'Code blocks got a proper frame \u2014 a header bar, a language badge and a Copy button, with inline code in the accent colour.',
            'Chat list previews are cleaned up: markdown is stripped, so a code block reads as "code" and a link as "link" rather than a wall of punctuation.'
          ]],
          ['Fixes', [
            'Video duration, finally. Four fallbacks now cover the containers that report nothing useful, including a backward scan for the metadata atom in a fragmented MP4.',
            'Media survived a restart on mobile again \u2014 a received file is stored with its data as well as its blob URL, so a URL that dies with the session can be rebuilt.',
            'A friend\u2019s status dot updates when they reply, not only when a beacon arrives.',
            'Reactions route to the right message in a direct message.',
            'The play overlay on a video responds to the first touch instead of the second.'
          ]],
          ['Version', [
            'Version: Bumped to v0.2.7-beta.'
          ]]
        ]) +
        versionBlock('0.2.6-beta', '', [
          ['New Features', [
            'Undo/Redo System — Full Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y support via the new UndoManager component. Covers: message send/delete/edit, settings changes (all tabs), profile updates (username, bio, avatar, banner), account switching, and chat navigation. Titlebar buttons with visual disabled state and tooltip hints.',
            'Konami Code Easter Egg — Type ↑↑↓↓←→←→BA or ↑↑↓↓←→←→AB to toggle Developer Mode. Visual sequence feedback shown in the title bar.',
            'Light Mode Flashbang Prevention — "Disable Light Mode Flashbang" toggle in Animation settings. A "Don\'t flashbang me next time" checkbox in the Light Mode warning dialog permanently skips the white flash.',
            'Theme Transition Animation — 600ms smooth CSS transition for background, border-color, color, fill, and stroke when switching themes. Respects Reduce Motion setting.',
            'Theme Change Easter Egg — Random theme-matched quotes shown as toasts when switching themes (7-9 texts per theme).',
            'Midnight Sleep Reminder — Between 12AM-5AM on dark/midnight themes, a toast gently reminds users to get some sleep.',
            'Gallery Audio/Video Playback — Gallery sidebar and Global Gallery now route audio files to the Audio Player and video files to the Video Player.',
            'ImageViewer Audio Player — New openAudio() method embeds the Audio Player for inline audio playback in the image viewer overlay.',
            'Activity Center Scroll-to-Message — Clicking an activity entry now scrolls to the specific message in chat.',
            'noFlashbang Setting in Theme Export/Import — The noFlashbang setting is included in exported theme JSON files.'
          ]],
          ['Bug Fixes', [
            'Profile Frame Per-Account Sync Fixed — Frame now reads from currentUser.profileFrame, not global settings. Switching accounts shows the correct frame.',
            'overlayIcon ReferenceError Fixed — Undeclared variable in gallery-sidebar.js caused gallery crash.',
            'Activity Center UI Shift Fixed — scrollIntoView propagation fixed with manual feed.scrollTop calculation.',
            'Mobile Buffer Loader Always Visible Fixed — Placeholder removal and overflow:hidden in mobile CSS.',
            'Image Send Bug Fixed — Blob URL revocation removed from renderMessages().',
            'Mobile Video Duration Mismatch Fixed — loadedmetadata event listener replaces forced seek hack.',
            'Mobile→Desktop Video Thumbnails Fixed — _poster field preserved across platforms.',
            'Gallery Audio/Video Route Fixed — Proper type detection routes to correct player.',
            'Mobile Fullscreen Taskbar Overlap Fixed — safe-area-inset-bottom padding.',
            'Blue Fullscreen Background Eliminated — 4-layer background fix across all fullscreen elements.',
            'Fullscreen Manual Only — Both platforms use _enterManualFS()/_exitManualFS() exclusively.'
          ]],
          ['Media Player Improvements', [
            'Fullscreen Theme Glow — Radial gradient accent glow behind video.',
            'App-wide Filled Icon State — _iconToggle helper switches filled/outlined Lucide icons.',
            'Byte-identical Players — shared and mobile player files confirmed identical.'
          ]],
          ['UI/UX Polish', [
            'Titlebar nav buttons switched to undo/redo icons.',
            'GPU-accelerated rendering with will-change + translateZ(0).',
            'Sidebar nav back/forward buttons with 50-entry history.'
          ]],
          ['Technical', [
            'New UndoManager component: 100-action stack, Ctrl+Z/Y/Shift+Z, privacy mode awareness.',
            'NoFlashbang setting, theme transition CSS classes, version bumped to v0.2.6-beta.'
          ]]
        ]) +
        versionBlock('0.2.5-beta', '', [
          ['New Features', [
            'Global Gallery Redesign — Grid and list views with audio/video type detection.',
            'Gallery Sidebar Improvements — Audio inline player, video posters, media type badges.',
            'Activity Center Enhancements — Refined rendering and click handling.'
          ]],
          ['Media Player Improvements', [
            '_poster field propagated through attachment pipeline for video thumbnails.'
          ]],
          ['UI/UX Polish', [
            'Sidebar nav header with Back/Forward navigation buttons.',
            'Activity Center shows Lucide icons with color badges, duration/size displays.'
          ]]
        ]) +
        versionBlock('0.2.4-beta', '', [
          ['Bug Fixes', [
            'Removed _skipCorrupted proactive seek in doPlay() — forced 1e10 seek replaced with loadedmetadata listeners.',
            'FILE_TRANSFER DM Packet Fix — chatId removed from DM FILE_TRANSFER packets.'
          ]]
        ]) +
        versionBlock('0.2.3-beta', '', [
          ['Bug Fixes', [
            'Render loop fix, _skipCorrupted state persistence across stop/play cycles, chatId packet routing fix.'
          ]]
        ]) +
        versionBlock('0.2.2-beta', '', [
          ['Media Player Improvements', [
            'Video Player complete overhaul — MP4 duration parsing, multi-layered fallback, eliminated forced seeks.',
            'Audio Player major rewrite — same architecture as video player, reliable metadata detection.',
            'Automatic Video Poster Capture at 0.5s on send (both platforms).',
            'Mobile sync — both players synced via shared/ui/ directory.'
          ]],
          ['Technical', [
            'Shared audio/video player refactored into clean module pattern.',
            'Version bumped to v0.2.2-beta.'
          ]]
        ]) +
        versionBlock('0.2.1-beta', '', [
          ['Bug Fixes', [
            'Null-check safety for audio/video player controls.',
            'Mobile audio/video player synced with desktop fixes.'
          ]],
          ['Technical', [
            'Version bumped to v0.2.1-beta.'
          ]]
        ]) +
        versionBlock('0.2.0-beta', '', [
          ['CRITICAL: Mobile Background Notifications & Large File Persistence', [
            'CRITICAL: Mobile Background Notifications Fixed — document.hidden is unreliable in Capacitor WebView; notifications never appeared outside the app. Two-layer fix: JS tracks background via Capacitor appStateChange, and Java OrbitP2PPlugin creates notifications directly via NotificationManager, bypassing the paused WebView entirely.',
            'CRITICAL: Large File Persistence on Mobile — Files >10MB in IndexedDB had blob: URLs die on restart. Added BlobStoreDB (IndexedDB wrapper) + _restoreAllBlobAttachments() on startup. "Restoring..." placeholders shown during recovery.'
          ]],
          ['Mobile base64 Streaming Optimizations', [
            'All 7 binary base64 decode sites rewritten as single-pass streaming decoders — Int8Array(256) lookup, inline validity counting, 4-char group buffer. No intermediate string allocations. Includes orbitBase64ToArrayBuffer, _base64ToBytes, _safeB64ToArrayBuffer (shared audio/video players).'
          ]],
          ['Notification & Lifecycle Fixes', [
            'Reliable App Background Detection: window._appIsBackgrounded maintained by Capacitor appStateChange listener instead of unreliable document.hidden.',
            'Native Android Notifications from Plugin: OrbitP2PPlugin.postMessageNotification() parses MESSAGE JSON, creates notification on orbit_messages channel via NotificationManager. Works regardless of WebView JS state.',
            'JS→Plugin Foreground Bridge: setForeground() plugin method ensures native notifications only fire when !_isForeground, preventing duplicates.'
          ]],
          ['Desktop File Transfer Fixes', [
            'Desktop AV Type Honor Fix: file-received handler now respects the sender\'s original type classification (e.g., .webm audio) instead of blindly re-classifying by extension. Prevents audio files from being routed to video player (which would trigger decode errors and +2s seeking).'
          ]],
          ['Media Player Improvements', [
            'muted=true Gated to Mobile Only: The muted preload hack (forces metadata loading on mobile) is now only applied on actual mobile devices. Desktop players no longer start muted.',
            'Blob MP4 Duration Parsing: parseMp4Duration() accepts direct ArrayBuffer via fetch(blob:URL), uses Uint8Array byte access instead of failing String.fromCharCode.apply on large buffers.',
            'Video Player Blob Duration Fallback: When blob: URL has no duration, fetches and parses MP4 header directly via moov→mvhd/mdhd atoms.'
          ]],
          ['Technical', [
            'Version bumped to v0.2.0-beta across all manifests, About tabs, and changelogs.',
            'Two-layer notification architecture: JS handles foreground (toast/sound); Java handles background via NotificationManager.',
            'All 7 binary decode sites unified to streaming single-pass algorithm.',
            'File persistence strategy: ≤10MB → data: URLs in localStorage; >10MB → IndexedDB via BlobStoreDB.'
          ]]
        ]) +
        versionBlock('0.1.9-beta', '', [
          ['CRITICAL: P2P Transfer & Service Lifecycle Fixes', [
            'CRITICAL: Mobile base64 Decode Corruption — atob() on Android WebView corrupts bytes >127. All 7 binary decode sites replaced with safe manual lookup-table decoder across video, audio, crypto, and file receiver.',
            'CRITICAL: Desktop→Mobile Chunk Joining — desktop btoa()\'s each 64KB chunk independently (each with own padding); mobile did chunks.join(\'\') → corrupt base64 at boundaries. Fixed: per-chunk independent decode + ArrayBuffer concat.',
            'CRITICAL: WriteStream Race (Mobile→Desktop) — stream.end() async; onComplete fired before flush → truncated files, lost audio/duration. Fixed: stream.on(\'finish\') wraps completion.',
            'CRITICAL: P2P cleanup() Race in Android Plugin — cleanup() called stopService() (async), then initP2P() called startServer() — ensureServiceRunning() found boundService still non-null and skipped restart. Fixed: Java cleanup() is a no-op (JS already clears listeners).'
          ]],
          ['File Transfer Fixes', [
            'Mobile Type Override Fixed (HIGH): FILE_TRANSFER_END no longer overwrites correct video/audio type with regex extension fallback — only overwrites if type is null/undefined/file.',
            'Mobile Video Compression Dropped Audio (HIGH): canvas.captureStream(15) captures only pixels. Disabled compressVideoMobile() — raw video with full audio sent via chunked transfer.',
            'Group Chat File Routing Fixed: FILE_TRANSFER_START/END lacked chatId — merge searched wrong chat. Added chatId to packets on desktop + mobile.',
            'Hash Mismatch Silenced: Platform hash difference (WebKit vs Node crypto) is harmless. Changed to console.warn only — file always saved.'
          ]],
          ['Media & UI Fixes', [
            'Mobile Metadata Preload: muted=true + preload=metadata forces mobile browsers to load duration immediately. Audio restored on play.',
            'Video Player preload Changed to metadata — saves bandwidth.',
            'Transfer Error X Button Fixed: preventDefault + stopPropagation on dismiss.',
            'Peer Status Dot After Auto-Connect: Immediate online status update.'
          ]],
          ['Quality of Life', [
            'Unstable AV Transfer Warning Modal: Shown on audio/video send. "Don\'t show again" checkbox, nicer alert-triangle icon.',
            'Auto-Discovery Diagnostic Logging: [AutoConnect] logs in DevTools.'
          ]],
          ['Technical', [
            'Version bumped to v0.1.9-beta.'
          ]]
        ]) +
        versionBlock('0.1.8.1-beta', '', [
          ['CRITICAL: P2P Cross-Platform Fixes', [
            'Mobile→Desktop File Transfers Silently Deleted (CRITICAL): Mobile sent hash: \'\' — desktop computed real SHA-256, always mismatched, deleted file. Fixed: mobile computes SHA-256 via crypto.subtle.digest() before sending; desktop skips hash check when omitted.',
            'Mobile FILE_TRANSFER Packets Had Empty from/senderId (CRITICAL): _sendLargeFileToPeer called createPacket with 2 args — from was \'\'. Fixed: passes MStore.user.id + peerId as fromId/toId.',
            'Mobile createPacket Signature Misaligned (CRITICAL): Mobile (type,payload,senderId) vs Desktop (type,fromId,toId,payload) — different arg order + missing packetId + missing to. Aligned to Desktop signature across all 28 call sites.',
            'Duplicate Messages for Large File Transfers (CRITICAL): Text MESSAGE + FILE_TRANSFER sent separately — receiver created two bubbles. Fixed: _fileId markers in MESSAGE attachments; receive handlers merge into existing message by _fileId before falling back to new entry.'
          ]],
          ['High-Impact Fixes', [
            'Missing File Extensions Added (HIGH): Video (m4v,wmv,flv,f4v,ts,mts,m2ts), Image (svg,tiff,bmp,heic,heif,avif), Audio (opus,mka) — all with correct MIME mappings.',
            'Media Persistence Fixed (HIGH): Received files no longer lost after restart. FILE_TRANSFER_END stores _dataUrl; renderMessages() reconstructs blob URLs from persisted base64.',
            'renderMessages No Longer Mutates Store (HIGH): Data URL→blob URL loop was mutating MStore.messages[chatId] in-place. Replaced with non-mutating _resUrl() helper.',
            '.webm File Misclassification Fixed (HIGH): .webm removed from audioMatch; video checked before audio.',
            'Desktop File Received isVideo Added (MEDIUM): Added isVideo detection with proper MIME mapping.'
          ]],
          ['Video Player', [
            'Mobile Video Aspect Ratio Fixed: Added object-fit: contain, max-height: 50vh, background: #000 to .ovp-video.'
          ]],
          ['Technical', [
            'Version bumped to v0.1.8.1-beta for hotfix release.'
          ]]
        ]) +
        versionBlock('0.1.8-beta', '', [
          ['Store Class Ported to Mobile', [
            'Dedicated Store class created: Inline MStore (~350 lines) extracted into mobile/src/js/store.js (760 lines) — full Store class with property-based access (MStore.friends, MStore.settings.*) for backward compatibility (532+ mobile references) plus desktop-style getState()/setState()/subscribe() for future convergence.',
            'Desktop parity features added to mobile: subscribe()/notify(), blockUser()/unblockUser(), pinMessage()/unpinMessage(), markAsRead(), toggleMute(), addGroup()/removeGroup()/addMemberToGroup(), closeDM()/togglePinDM()/reopenDM(), E2EE peer key storage, transfer tracking, addOrUpdatePeer().'
          ]],
          ['Bug Fixes', [
            'addMessage() unread tracking fixed (HIGH): Unread block removed — mobile manages unreads via chat.unread, not Store\'s internal counts. Every message was previously counted as unread because this.activeChatId is never set by mobile.',
            'mutedChats property misalignment fixed (HIGH): this.mutedChats now aliases this.settings.mutedChats (same object reference) — synced in constructor, load(), and save(). All mute/unmute operations update the same object mobile reads via MStore.settings.mutedChats.',
            'setState() currentUser ignored fixed (MEDIUM): setState() now maps newState.currentUser to this.user — previously silently dropped.'
          ]],
          ['Technical', [
            'MStore API fully backward-compatible — window.MStore = new Store() loaded via script tag before app.js in mobile index.html.',
            'Desktop CSP updated to allow https://cdnjs.cloudflare.com for Prism.js syntax highlighting (script-src + style-src).',
            'Prism.js loading fixed: moved to load before app.js on both platforms. Language-* class added to pre elements in sanitize.js for immediate CSS theming.',
            'Version bumped to v0.1.8-beta across all manifests, About tabs, and changelogs.'
          ]]
        ]) +
        versionBlock('0.1.7-beta', '', [
          ['Video Playback Fixes', [
            'PIPELINE_ERROR_DECODE Root Cause Fixed: Audio packet decode errors in fMP4 files resolved via Content-Type fix in main.js:contentTypeFromAtt(). Videos play continuously without stalling at ~16s.',
            'Re-render Guard: Store subscription blocks message re-renders while any video is playing (except chat switches). Handles notify() without changedState.',
            'Decode Error Retry: On PIPELINE_ERROR_DECODE, source reloads and skips forward +2s past corrupt packet (up to 3 attempts).',
            'Removed Forced Seeking: Eliminated currentTime = 1e10 hack for orbit-db:// / orbit-file:// URLs that caused playback pauses.'
          ]],
          ['Media Player UX Improvements', [
            'Larger Video Player: Display increased to 720x600 in message bubbles. Fullscreen includes box-shadow and theme-matched letterbox background.',
            'Larger Audio Player: Waveform canvas height increased to 200px with full-width container (720px), matching video layout.',
            'Separated Media Layout: Video and audio removed from image grid — rendered as standalone blocks at full width. Grid stays at 280px max-width.',
            'Fullscreen Theme Integration: Letterbox uses var(--bg-surface) — blends with active UI theme instead of hard black.'
          ]]
        ]) +
        versionBlock('0.1.6-beta', '', [
          ['P2P Connectivity & Bug Fixes', [
            'Desktop Auto-Connect Port: Uses peer.tcpPort instead of hardcoded 46000. Per-peer ports stored in SocketManager._peerPorts map.',
            'Desktop Manual Connect: Connect accepts port parameter (default 46000) via preload bridge.',
            'Desktop P2P Edit Broadcast Loop Fixed: store.editMessage no longer re-broadcasts (caused echo). Single broadcast from chat-panel.js:sendToAll.',
            'Desktop Context Menu "Edit Message": No-op log replaced with proper editingMsg flow.',
            'Mobile Disconnect Handler Fixed (Critical): Friend lookup by connectionId (native ip:port) works — connectionId stored on connect + beacon. Falls back to IP split.',
            'Mobile TCP/UDP Beacon Handlers: Store tcpPort, connectionId, ip on friends. Auto-reconnect uses peer\'s port, not own.',
            'Mobile Orbit Echo Stays Online: Status correctly reset to online on friend load.'
          ]],
          ['Message Editing & Reactions', [
            'Mobile Edit P2P Broadcast: Edits broadcast to DMs and group members with chatId for group routing.',
            'Mobile edited Flag: Incoming MESSAGE_EDIT sets msg.edited = true.',
            'Mobile Reaction UI: Reaction button, floating picker (6 emojis), toggle on pills, instant local state + P2P broadcast via REACTION protocol.'
          ]],
          ['Android Foreground Service', [
            'OrbitForegroundService: Full P2P engine as persistent Android Service — TCP server, UDP multicast, WakeLock, START_STICKY.',
            'OrbitP2PPlugin: Thin proxy forwarding calls via Binder. Event queue drained every 100ms via Handler.',
            'BootReceiver: Restarts foreground service on BOOT_COMPLETED.',
            'JS Lifecycle: visibilitychange, appStateChange, pageshow re-render UI and restart discovery on foreground.',
            'sendFailed/connectFailed events delivered to JS listeners (were silently dropped).',
            'Battery Optimization: REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission + JS bridge method.'
          ]],
          ['Silent Bug Fixes', [
            'serverSocket made volatile — prevents stale null on stopServer',
            'PeerConnection stale map entry eliminated — both original + updated peerId keys cleaned on disconnect',
            'Executor shutdownNow on destroy — prevents thread leaks on START_STICKY recreation',
            'Static eventQueue cleared on destroy — prevents stale events from old instance',
            'SO_REUSEADDR on MulticastSocket — prevents bind failure on discovery restart after network change',
            'joinGroup with explicit NetworkInterface — Android 10+ compatibility'
          ]]
        ]) +
        versionBlock('0.1.5-beta', '', [
          ['New Features', [
            'Account Switcher (Experimental): Right-click avatar → panel to add/switch/logout accounts. Last active user auto-loaded. Gated behind Experimental Features.',
            'PIN Lock Screen (2FA Experimental): 4-8 digit PIN, SHA-256 hashed on main process, numpad UI, 5-attempt cooldown, Forgot PIN reset. Gated behind Experimental Features.',
            'Settings Security Tab: PIN setup, change, disable — re-renders when Experimental Features toggled.',
            'Orbit Echo Welcome Sequence: 4 welcome messages with typing indicator delays.',
            'Per-Account Message Isolation: Messages stored per-user via userChatIds. DB migration v11 adds accountOwnerId columns. reloadDataForCurrentUser() filters messages per account.',
            'Per-Account Avatar Frames: v10 migration adds profileFrame to users table. Frame loaded from user record, not shared settings.',
            'Avatar Frames in Account Switcher: Frame overlays on current account + other account rows.',
            'Beacon Payload Enriched: Both UDP and TCP beacons transmit avatar, banner, bio, profileFrame, publicKey.',
            'Friend Status Starts Offline: Friends load offline (except Echo). Offline check 45s threshold, 15s interval. Discovery emits peer-gone.',
            'Group Avatar Backfill: Async fetch of orbit-avatar:// for groups with avatarPath but no avatarDataUrl.',
            'Profile Frame Migration: Existing settings-based frames copied to per-account user record on first boot after v10.'
          ]],
          ['Bug Fixes', [
            'Messages from other accounts no longer leak — auto-track scoped to accountOwnerId, renderList filters by _userChatIds, renderGroups checks membership',
            'Closing DMs no longer affects other accounts — closeDM skips dbDeleteFriend, closedDMs/pinnedDMs stored per-account in settings',
            'Leaving groups correctly hides the group — removeGroupMember untracks chat, renderGroups checks membership',
            '"User"#0000 placeholder leaking fixed — getAll() filters invalid entries, store placeholder uses userId: null',
            'Profile frame migration condition fixed — pf && pf !== cur handles null→0 conversion by saveUser',
            'SidebarLeft.renderAvatar crashes before init — added !this.container guard',
            'Store.js trailing comma syntax error fixed between class methods',
            'window.ChatPanel.showChat not a function — removed premature call from reloadDataForCurrentUser',
            'require(\'crypto\') → window.crypto in renderer for invite code generation',
            'Migration v11 robustness — column-existence checks, user_version guard for non-transactional pragma'
          ]]
        ]) +
        versionBlock('0.1.4-beta', '', [
          ['New Features', [
            'Desktop P2P Bugfix Audit (17 fixes): Socket 8s timeout disabled after connect, write-queue key precedence fix, reconnect .catch() + counter reset on data, preload reconnect args, PIN/UNPIN groupId routing, GROUP_MEMBER_ADDED field update, GROUP_CREATE publicKey enrichment, GROUP_JOIN_REQUEST usertag/avatar/status',
            'P2P Auto-Connection Stabilization: PING/PONG keep-alive (15s heartbeat, 30s idle → close), 8s connection timeout, reconnect with exponential backoff (5 attempts max, 30s cap), stale peer pruning (180s), network change detection (10s IP polling → full restart), auto-connect duplicate protection',
            'Translation Engine Rewrite: In-memory cache, request dedup, AbortController for in-flight requests, inline Retry link on failure',
            'Voice Messages Stabilization: audio/webm content-type fix, onerror auto-retry, chunked transfer audio detection with MIME mapping',
            'Image Viewer: Quick-save button (showSaveFilePicker + Blob fallback), keyboard nav (← → Escape), swipe (mouse drag + touch), download fix (fetch+blob for custom protocol URLs), loading placeholder CSS',
            'Performance Mode: Two-step confirmation, .performance-mode CSS class on &lt;html&gt;, runtime guards in chat-panel and app.js',
            'Mobile Protocol.js Synced: 15+ missing types (MESSAGE_EDIT, CALL_*, FILE_TRANSFER_*, PIN, SYSTEM, PING/PONG, etc.) — full 46-type parity with desktop',
            'Desktop Settings Ported to Mobile: 11 new defaults (notifyVolume, notifySoundType, translateTargetLang, netReconnectInterval, netKeepAlive, logLevel, etc.)',
            'Mobile Settings Wired: logLevel filters debugLog(), tcpPort/udpPort in beacon/P2P, netReconnectInterval in auto-reconnect, netKeepAlive in heartbeat, netBandwidthLimit throttles FILE_CHUNK, networkMode shows/hides UDP field',
            'Mobile Notifications: Sound toggle, volume slider (0-100), sound type select (Chime/Pop/Gentle/Classic)',
            'Mobile Translation: Target language select (30 languages), auto-detect toggle, moved to Chat section',
            'Mobile Network Settings: Reconnect interval, keep-alive select, WebRTC fallback, log level, bandwidth limit',
            'Mobile DB Migration Fixed: Runs before MStore.load() — old unprefixed localStorage keys now picked up correctly',
            'Mobile What\'s New: Full changelog modal in About tab (v0.0.2 through v0.1.4)',
            'Cross-Platform Avatar Sync: Group avatar data URL stored on upload, sent in GROUP_CREATE/GROUP_JOIN_RESPONSE, rendered on desktop (avatarDataUrl fallback) and mobile (GROUP_JOIN_RESPONSE avatar field)'
          ]],
          ['Bug Fixes', [
            'Desktop blank window fixed — missing closing paren in app.js:777 ternary chain crashed entire renderer',
            'Mobile GROUP_CREATE/GROUP_JOIN_RESPONSE exempted from chat-existence check (they create the chat)',
            'Mobile group handlers check origin.username || origin.name for name/username mismatch',
            'Mobile toast concatenation operator precedence fixed',
            'Mobile auto-reconnect now reads netReconnectInterval from settings (was hardcoded 5s)',
            'Mobile PING/PONG heartbeat uses netKeepAlive from settings (was not implemented)',
            'Mobile TCP timeout + UDP port now passed from settings to native Java plugin',
            'profileFrame value 0 stored correctly (TCP beacon was converting 0→null via ||)',
            'Desktop group sync fixes: GROUP_OWNER_TRANSFER role, GROUP_LEAVE cleanup, GROUP_INVITE init, PIN/UNPIN routing',
            'Desktop write-queue key collision fixed (key + "" → "" + key operator precedence)',
            'Desktop reconnect .catch() added, counter resets on data, duplicate connection protection',
            'Forward to group fixed — missing chatId in payload caused group forwards to arrive in DMs',
            'Message edit/delete routing fixed — MESSAGE_EDIT and MESSAGE_DELETE now include chatId for group targets',
            'Duplicate message guard — _sending lock prevents concurrent sendMessage calls, msgId dedup in addMessage',
            'GROUP_MEMBER_ADDED immutable state — replaced direct mutation with proper setState',
            'addMemberToGroup avatar enrichment — member avatar now cross-referenced from friends list',
            'Desktop GROUP_CREATE handler reads groupAvatar from mobile packets, stores as avatarDataUrl',
            'Mobile GROUP_JOIN_RESPONSE handler reads groupAvatar and stores on group + chat entry'
          ]]
        ]) +
        versionBlock('0.1.3-beta', '', [
          ['New Features', [
            'Native Android System Notifications: Messages now show as real system notifications when app is backgrounded (requires POST_NOTIFICATIONS permission)',
            'Desktop Notification Avatars: Sender/group avatar now shown as notification icon (previously static Orbit icon)',
            'Connection Stats Panel: Live P2P status — online peers, uptime, sent/received message counters (refreshes every 2s)',
            'Video File Support: Upload, render, and view video files in chat — &lt;video&gt; elements with play overlay in message bubbles',
            'Video Preview Modal: Full-screen video player on desktop and mobile (matching image preview UX)',
            'Video Compression: Large videos (>5MB) auto-compressed to 720p/500kbps via MediaRecorder + captureStream before sending',
            'P2P Discovery Optimized: Beacon interval reduced 5s→10s, stale threshold 120s→180s, exponential chunk retry backoff',
            'Group Info UI: Hardcoded colors replaced with theme CSS variables for consistent dark/light mode appearance',
            'Performance Mode: New toggle in Experimental settings with two-step confirmation — disables animations, link previews, GIF playback, and background CPU tasks',
            'Compact Spacing & Swipe-to-Reply settings moved from Experimental to chat settings (always available)',
            'Animated avatars, profile frames, message FX improved CSS implementations for mobile'
          ]],
          ['Bug Fixes & Optimizations', [
            'Image Viewer Fix: Clicking image thumbnails now opens viewer after restart — hit-test fallback when DOM is recreated mid-click, and removed \'friends\' from chat-panel store subscription to stop full re-renders on friend status beacons',
            'JS-Level CPU Optimization: Freeze GIF playback, skip link preview OG fetch, slow offline check to 60s, stop connection stats polling (desktop), stop dev overlay rAF polling (mobile)',
            'Forced Reflow Cascade Eliminated: ResizeObserver disconnected before innerHTML in renderChat, reconnected after all DOM changes; throttled to 1s to prevent cascade from async image loads',
            'data-refreshing Animation Guard: Attribute set on container before innerHTML, removed after requestAnimationFrame — CSS suppresses message entrance animation on re-render',
            'Leaked Offline Check Interval Fixed: Removed duplicate startup setInterval — applySettings() is now single source for offline check interval',
            'Mobile HTML Nesting Fixed: Missing div closing tag concatenation caused broken structure in Performance Mode toggle row',
            'image-viewer.js Null-Safety: openFromMessage now checks store null, falls through to fallback URL when gallery is empty; close() and openVideo() wrapped in try/catch for missing DOM elements; init() uses readyState guard'
          ]]
        ]) +
        versionBlock('0.1.2-beta', '', [
          ['Bug Fixes', [
            'Manual Connect Bug Fixed: "Add a Friend" IP connect no longer creates duplicate TCP connections — socket remapping now works when peerId is "manual"',
            'Hardcoded type strings eliminated: store.js (16) and mobile/app.js (5) now use Protocol.Types constants — no more silent failures on unknown type strings'
          ]],
          ['Technical', [
            'Protocol Type Unification: All 47 types unified across shared/ and desktop/ protocol.js — cross-platform call/file-transfer/group compatibility guaranteed',
            'Build Pipeline Overhaul: Android assembleRelease, SHA256 checksums, artifact verification, build metadata (version/commit/date), asset size table in release notes'
          ]]
        ]) +
        versionBlock('0.1.1-beta', 'Legacy Stable', [
          ['New Features', [
            'Voice & Video Calls (P2P): Full WebRTC call system with incoming notification, mute/speaker controls, timer, ICE exchange',
            'Group Calls (Mesh): Each participant gets their own RTCPeerConnection; video grid or avatar circles for audio-only',
            'Camera Toggle: On/off during calls with deterministic HSL avatar placeholder when camera is off',
            'Message Forwarding: Forward messages with attachments to any chat via chat picker modal (desktop + mobile)',
            'Block User: Block/unblock from context menu and profile sidebar; P2P filter drops blocked packets',
            'Search Within a Chat: Scoped search with chatId filter, sender filter, date inputs, context-aware placeholders',
            'Export Chat History: JSON or TXT export with timestamped downloads via Data Manager',
            'Save/Load Themes: Export current theme as JSON; import via file picker in Appearance tab',
            'Message Translate Unlocked: Always-on translate button (no experimental gate), default enabled in Appearance tab'
          ]],
          ['Bug Fixes', [
            'Mobile Reply fromName Fix: fromName now set on ALL outgoing MESSAGE packets — cross-platform reply consistency',
            'Lucide Icon Null Fix: All querySelector(\'i\') changed to querySelector(\'svg\') — createIcons replaces i tags with svg',
            'Camera Placeholder Refactored: Pre-rendered in HTML — no dynamic DOM creation; just toggles display:none',
            'Call Modal UI: Proper centering, audio wave bars, hover button effects, local video as full grid tile in groups'
          ]],
          ['Polish', [
            'Online Status: lastSeen on BEACON, 30s interval checks for stale connections (120s timeout)',
            'Inline code/pre CSS styling for both platforms'
          ]]
        ]) +
        versionBlock('0.1.0-beta', '', [
          ['Performance', [
            'Performance: Up to 5× faster startup and rendering — selective store subscriptions, setStateBatch microtask coalescing, insertAdjacentHTML, event delegation for all message actions',
            'Startup: ~40% faster (5s → 3s) — deferred init phases (setTimeout(0) + requestIdleCallback), batched store IPC (7+ calls → 1), lazy message loading (last 50 per chat, load on demand)',
            'freezeGifImages: Canvas cache via _frozenCache Map; expanded selectors (orbit-db://, .avatar img); global call on Reduce Motion toggle; mobile feed re-render on toggle'
          ]],
          ['Bug Fixes', [
            'Bug fix: orbit-db://attachment/ 404 — base64 data URL extraction in addMessage for both privacy and non-privacy modes',
            'Bug fix: Selective subscriber undefined changedState — store.notify() without args no longer throws',
            'Bug fix: Message avatar click moved from re-attached attachEvents to initDelegatedActions (registered once)',
            'Bug fix: loadFullChatMessages was dropping existing messages (only stored the diff, not full result)'
          ]],
          ['New', [
            'Data Manager "Load All Stored Data" — double-confirmation button loads all messages from DB into memory on demand'
          ]]
        ]) +
        versionBlock('0.0.9.3-beta', '', [
          ['New Features', [
            'Group Info Panel overhaul — Add Member (friend picker), Leave Group, Transfer Ownership, member search, created date, online/total count',
            'DM context menus — right-click on desktop, long-press on mobile: Pin/Unpin, Mute, View Profile, Copy ID, Close DM (removes friend from DB)',
            'Pinned DMs — pinned state sorted first in sidebar with pin icon',
            'Close DM removes friend — calls dbDeleteFriend; persists closedDMs; auto-reopens on new message',
            'P2P Diagnostics panel — logs, errors, peer info, connection stats via button in connection stats overlay',
            'Debug log buffer — window._debugLogBuffer captures last 500 console entries',
            'Global Gallery type filters — All/Images/Files, non-images render with file icons, gallery view mode persisted to DB',
            'Create Group modal — shows friend avatars with profile frames'
          ]],
          ['Bug Fixes', [
            'Gallery sidebar Files tab fix — Format.bytes→fileSize, download button replaces window.open for custom protocol URLs',
            'Context menu fix — data-action attribute never set; rewritten to use DOM methods with captured onClick',
            'P2P protocol audit — isPeerConnected key mismatch, protocol type string fixes, TCP merge IP strip port'
          ]],
          ['Technical', [
            'GROUP_MEMBER_ADDED and GROUP_OWNER_TRANSFER protocol types — cross-platform support'
          ]]
        ]) +
        versionBlock('0.0.9.2-beta', '', [
          ['New Features', [
            'Mobile initP2P Logging — detailed debug logs throughout P2P initialization and lifecycle',
            'Dev Mode DevTools — toggling Developer Mode loads eruda on-device inspector panel',
            'Debug Log Buffer — scrollable log overlay when dev mode is active'
          ]],
          ['Bug Fixes', [
            'Bug #1: Desktop sends messages to mobile (socket.remoteAddress as BEACON IP fallback)',
            'Bug #2: Mobile peer merging (host:port→UUID dedup)'
          ]],
          ['Technical', [
            'Cross-platform v0.0.9.1-beta version sync',
            'Cross-platform v0.0.9.2-beta version sync'
          ]]
        ]) +
        versionBlock('0.0.9-beta', '', [
          ['Bug Fixes', [
            'Android P2P Stability — 8 Java plugin fixes (multicast lock, beacon gating, TCP buffer, connection tracking) + 4 JS bridge fixes',
            'Desktop P2P Stability — 9 fixes (write queue, oversized frames, socket errors, self-beacon filter, transfer backpressure, restart)',
            'Desktop Socket Write Queue — per-connection queue prevents TCP byte interleaving on length-prefixed frames',
            'Android Add Friend — no more P2P Preview gate; cleartext traffic flag; plugin retry mechanism',
            'Mobile DB Fix — migration runs after user load to prevent identity corruption on restart',
            'Desktop Bug Fixes — require(crypto) → window.crypto in sidebar-middle; PIN_MESSAGE groupId in payload'
          ]],
          ['New Features', [
            'Mobile Group Info Panel — full panel: edit name/description, avatar change, invite code + share, pin/mute, members with roles + join dates, promote/demote/remove, leave/delete',
            'Pinned Messages — pin/unpin in action bar; pinned section in group info; cross-platform sync via shared protocol',
            'Message Search — search bar filters messages in real-time on mobile chat header',
            'Member Join Dates — shows "Joined Jan 15, 2026" in group member list',
            'Enhanced Message FX — particle confetti system (both platforms); safe CSS (no color-mix, no overflow:hidden)',
            'Mobile Settings — Font Size (S/M/L), Message Animation (Slide/Fade), Auto-Reconnect toggle, Connection Timeout (5/10/30/60s)',
            'Avatar in P2P Beacons — cross-platform avatar sharing in discovery packets'
          ]],
          ['Technical', [
            'Cross-Platform Group Sync — GROUP_CREATE/GROUP_LEAVE broadcast compatible between mobile and desktop'
          ]]
        ]) +
        versionBlock('0.0.8-beta', '', [
          ['New Features', [
            'Rich Link Previews v2 — Open Graph metadata (title, description, image) fetched via Electron IPC',
            'Message Link Styling — URLs in chat text now clickable with hover/active color states (both desktop + mobile)',
            'Cross-Platform P2P — Desktop ↔ Android LAN discovery and messaging via TCP/UDP',
            'Mobile Settings Wired — All toggles now have real behavior (time format, avatars, images, notifications, etc.)',
            'Mobile Toast Overhaul — Type-based accent bar, icons, slide-in animation, progress bar',
            'Mobile Notification Sound — Web Audio beep on incoming P2P messages',
            'Desktop Settings Tabs — Notifications (volume/sound/test), Network (collapsibles), About (version info)',
            'Chat Background Patterns — Diagonal Stripes, Crosshatch, Circles'
          ]],
          ['Bug Fixes', [
            'QR Code Fixes — Both desktop and mobile QR generation fixed; mobile QR moved to Add Friend modal',
            'Desktop Bug Fixes — MIME mapping, cache headers, media retry, attachment URL stability'
          ]]
        ]) +
        versionBlock('0.0.7-beta', '', [
          ['New Features', [
            'First-Time User Tutorial (Welcome Tour) — skippable and replayable via Settings',
            'Link Previews — Rich URL cards rendered directly in chat messages',
            'Activity Center Overhaul — Modern notification timeline with Tabs (All, Mentions, Files, System Logs)',
            'Shared Media Gallery — Revamped right-side panel with Images, Files, and Links grouped chronologically',
            'Privacy Mode Overhaul — Attachments and thumbnails are properly handled and cleaned up'
          ]],
          ['Technical', [
            'Android Port Architecture — Core cross-platform abstractions built for upcoming mobile release'
          ]],
          ['Bug Fixes', [
            'Numerous UI polish and stability bug fixes (Attachment 404s, CSP blocks, Layout quirks, etc.)'
          ]]
        ]) +
        versionBlock('0.0.6-beta', '', [
          ['Bug Fixes', [
            'XSS fixes — all onclick handlers use data-attributes + addEventListener',
            'CSS injection fix — profile banner set via style property, not string concat',
            'Network packet null-safety — all packet.payload handlers guarded against malformed packets',
            'Store immutability — addMessage, editMessage use immutable patterns',
            'Fixed duplicate addMemberToGroup definition (lost joinedAt preservation)',
            'Data cleanup on removeGroup — messages, pins, counts, mute state cleaned up',
            'Added removeFriend() with full data cleanup',
            'Fixed unhandled promise rejection in avatar upload',
            'Button loading/disabled states on backup, restore, connect operations',
            'Fixed require(crypto) in renderer — replaced with crypto.getRandomValues',
            'Unguarded networkSend calls — all guarded with if (window.orbitAPI)',
            'Consistent clipboard — IPC clipboard with navigator.clipboard fallback'
          ]],
          ['New Features', [
            'Keyboard accessibility for settings collapsible sections',
            'Null guards on settings/profile DOM element lookups',
            'Dev Mode master gate — controls all Advanced settings (debug + experimental)',
            'True Dark theme — neutral grays + blue accent; old dark renamed to Dark Purple',
            'Custom theme dropdown — pre-made themes: Midnight, Sunset, Nord, Seasonal',
            'Seasonal theme — auto-rotates by meteorological season (4 CSS files)',
            'Custom Colors modal — live preview editor for all UI color categories',
            'Experimental badges — yellow EXPERIMENTAL pill on all experimental toggles',
            'Experimental Features section — separate collapsible in Advanced tab',
            'Profile Frames — 42 decorative frame overlays on avatars (experimental)',
            'Animated Avatars — subtle pulse animation (experimental)',
            'Enhanced Message FX — sparkle effect on sent messages (experimental)',
            'Message Translate — translate button on message hover via MyMemory API (experimental)',
            'Compact Spacing — tighter message layout (experimental)',
            'Chat input area shadow — theme-adaptive elevation effect',
            'App Zoom slider — preview with restart notification (no more UI breakage)',
            'Chat settings: Enter to Send, Show Avatars, Image Previews',
            'Orbit Echo always persisted in database for testing',
            'Toast notification types — info/success/warning/error icons'
          ]]
        ]) +
        versionBlock('0.0.5-beta', 'Stable', [
          ['New Features', [
            'Backup & Restore (.orzip / .zip) with database transaction safety',
            'Database Health Check with integrity verification',
            'Database Repair — VACUUM, REINDEX, orphan removal',
            'Unread badges with count on DM and group rows',
            '@mention highlighting in chat messages',
            'Mention badges (distinct red badge) for @mentions',
            'Jump to first unread button in chat feed',
            'Unread messages divider in chat',
            'Read receipts — see when your message was read',
            'Edit message sync — edits now broadcast to peers',
            'Per-chat mute/unmute from right-click menu',
            'Mute toggle in profile sidebar',
            'Muted chat indicator (bell-off icon) in sidebar',
            'Keyboard shortcuts: Ctrl+K search, Ctrl+Shift+M mute, / to focus input',
            'Transfer cancellation with retry (3x backoff) and error banners',
            'Disk space check before receiving files',
            'File size enforcement (configurable max, default 500MB)',
            'Group roles: Owner, Admin, Member with promote/demote',
            'Group Info Panel with role badges (Owner/Admin)',
            'Group context menu: Pin, Info, Mute, Copy Invite, Leave, Delete',
            'Share invite codes directly in chat',
            'Clickable invite code chips with Join button',
            'Join request Accept/Deny modal for group owners',
            'Group row polish: sender preview, online member count',
            'Message Search v2: relevance ranking + sender/date filters',
            'Admin can remove non-admin, non-owner members',
            'Network Dashboard with live peer stats',
            'Do Not Disturb mode with live status banner',
            'Custom attachment auto-delete timer (1 min — 24 hours)',
            'Privacy Mode toggle — ephemeral attachments only',
            'Clear All Saved Attachments button',
            'Chat background patterns: Dots, Grid',
            'End-to-end encryption (ECDH + AES-256-GCM) for DMs — toggle in Data Manager',
            'E2EE public key exchange via LAN discovery beacons',
            'Developer Mode — opens Electron DevTools via IPC',
            'Experimental Features toggle with notification',
            'Settings tabs redesigned with collapsible sections: Account (live preview), Appearance, Notifications, Advanced, About',
            'Activity Center — unified recent messages modal with sender avatars and attachment icons',
            'Storage button — opens Data Manager directly from left sidebar',
            'Sidebar buttons visibility toggles in Appearance → Text & Layout (Activity, Gallery, Storage)',
            'Fixed sidebar width persistence on startup',
            'Groups button removed from left sidebar (accessible via middle sidebar tabs)'
          ]],
          ['Technical', [
            'GROUP_LEAVE protocol — broadcasts leave to all peers'
          ]]
        ]) +
        versionBlock('0.0.4-beta', '', [
          ['New Features', [
            'Group chat creation and joining',
            'Invite code system for groups',
            'Pinned messages',
            'Message reactions',
            'Image gallery sidebar',
            'Global gallery tab',
            'Transfer progress UI',
            'File transfer system with TCP'
          ]]
        ]) +
        versionBlock('0.0.3-beta', '', [
          ['New Features', [
            'LAN peer discovery via UDP broadcasting',
            'Local echo channel for testing',
            'Friend list with online status'
          ]]
        ]) +
        versionBlock('0.0.2-beta', '', [
          ['New Features', [
            'Early development release with core messaging infrastructure',
            'User identity and profile system',
            'Settings and preferences framework'
          ]]
        ]) +
      '</div>';

    function changelogEntry(version, tag, items) {
      var tagHtml = tag ? '<span style="font-size:10px;font-weight:700;color:#fff;background:var(--accent-primary);border-radius:4px;padding:2px 6px;margin-left:8px;text-transform:uppercase;">' + tag + '</span>' : '';
      var itemsHtml = items.map(function(i) { return '<li style="font-size:13px;color:var(--text-secondary);line-height:1.6;">' + i + '</li>'; }).join('');
      return '<div style="border-bottom:1px solid var(--border-subtle);padding-bottom:16px;">' +
        '<div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">v' + version + tagHtml + '</div>' +
        '<ul style="margin:0;padding-left:20px;">' + itemsHtml + '</ul>' +
      '</div>';
    }

    function versionBlock(version, tag, sections) {
      var tagHtml = tag ? '<span style="font-size:10px;font-weight:700;color:#fff;background:var(--accent-primary);border-radius:4px;padding:2px 6px;margin-left:8px;text-transform:uppercase;">' + tag + '</span>' : '';
      var bodyHtml = sections.map(function(s) {
        var itemsHtml = s[1].map(function(i) { return '<li style="font-size:13px;color:var(--text-secondary);line-height:1.6;">' + i + '</li>'; }).join('');
        return '<div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin:12px 0 4px 0;">' + s[0] + '</div>' +
          '<ul style="margin:0;padding-left:20px;">' + itemsHtml + '</ul>';
      }).join('');
      return '<div style="border-bottom:1px solid var(--border-subtle);padding-bottom:16px;">' +
        '<div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">v' + version + tagHtml + '</div>' +
        bodyHtml +
      '</div>';
    }

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this._overlay = overlay;

    if (window.lucide) window.lucide.createIcons({ root: modal });

    modal.querySelector('#changelog-close').addEventListener('click', function() { window.Changelog.close(); });

    document.addEventListener('keydown', this._escHandler = function(e) {
      if (e.key === 'Escape') window.Changelog.close();
    });
  },

  close() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
  }
};
