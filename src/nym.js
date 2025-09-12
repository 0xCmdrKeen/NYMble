import { broadcastRelays, monitorRelays, nosflareRelay } from "./nym/relays";
import { defaultEmojis, allEmojis, emojiMap } from "./nym/emojis";
import * as NostrTools from 'nostr-tools';
import QRCode from 'qrcode';

// NYM - Ephemeral Nostr Chat
export class NYM {
    constructor() {
        this.relayPool = new Map();
        this.blacklistedRelays = new Set();
        this.relayKinds = new Map();
        this.relayVerificationTimeout = 10000;
        this.monitorRelays = monitorRelays;
        this.broadcastRelays = broadcastRelays;
        this.nosflareRelay = nosflareRelay;
        this.discoveredRelays = new Set();
        this.relayList = [];
        this.lastRelayDiscovery = 0;
        this.relayDiscoveryInterval = 300000;
        this.maxRelaysForReq = 1000;
        this.relayTimeout = 2000;
        this.eventDeduplication = new Map();
        this.reconnectingRelays = new Set();
        this.blacklistedRelays = new Set();
        this.blacklistTimestamps = new Map();
        this.blacklistDuration = 300000;
        this.pubkey = null;
        this.privkey = null;
        this.nym = null;
        this.connectionMode = 'ephemeral';
        this.originalProfile = null;
        this.currentChannel = 'bar';
        this.currentGeohash = '';
        this.currentPM = null;
        this.messages = new Map();
        this.pmMessages = new Map();
        this.users = new Map();
        this.channelUsers = new Map();
        this.channels = new Map();
        this.pmConversations = new Map();
        this.unreadCounts = new Map();
        this.blockedUsers = new Set();
        this.blockedKeywords = new Set();
        this.blockedChannels = new Set();
        this.settings = this.loadSettings();
        this.commandHistory = [];
        this.historyIndex = -1;
        this.connected = false;
        this.messageQueue = [];
        this.autocompleteIndex = -1;
        this.commandPaletteIndex = -1;
        this.emojiAutocompleteIndex = -1;
        this.commonChannels = ['bar', 'random', 'nostr', 'bitcoin', 'tech', 'music', 'gaming', 'anime', 'memes', 'news', 'politics', 'science', 'art', 'food', 'sports'];
        this.commonGeohashes = ['w1', 'w2', 'dr5r', '9q8y', 'u4pr', 'gcpv', 'f2m6', 'xn77', 'tjm5'];
        this.userJoinedChannels = new Set(this.loadUserJoinedChannels());
        this.inPMMode = false;
        this.userSearchTerm = '';
        this.geohashRegex = /^[0-9bcdefghjkmnpqrstuvwxyz]{1,12}$/;
        this.pinnedChannels = new Set();
        this.reactions = new Map();
        this.failedRelays = new Map();
        this.relayRetryDelay = 15 * 60 * 1000;
        this.floodTracking = new Map();
        this.activeReactionPicker = null;
        this.activeReactionPickerButton = null;
        this.usingExtension = false;
        this.contextMenuTarget = null;
        this.contextMenuData = null;
        this.awayMessages = new Map();
        this.recentEmojis = [];
        this.allEmojis = allEmojis;
        this.emojiMap = emojiMap;
        this.discoveredChannelsIndex = 0;
        this.swipeStartX = null;
        this.swipeThreshold = 50;
        this.enhancedEmojiModal = null;
        this.loadRecentEmojis();
        this.lightningAddress = null;
        this.userLightningAddresses = new Map();
        this.zaps = new Map();
        this.currentZapTarget = null;
        this.currentZapInvoice = null;
        this.zapCheckInterval = null;
        this.zapInvoiceData = null;
        this.listExpansionStates = new Map();
        this.userLocation = null;
        this.userColors = new Map();
        this.sortByProximity = localStorage.getItem('nym_sort_proximity') === 'true';
        this.verifiedDeveloper = {
            npub: 'npub16jdfqgazrkapk0yrqm9rdxlnys7ck39c7zmdzxtxqlmmpxg04r0sd733sv',
            pubkey: 'd49a9023a21dba1b3c8306ca369bf3243d8b44b8f0b6d1196607f7b0990fa8df',
            title: 'NYM Developer'
        };
    }

    getUserColorClass(pubkey) {
        if (this.settings.theme !== 'bitchat') return '';

        // Your own messages are always orange
        if (pubkey === this.pubkey) {
            return 'bitchat-theme';
        }

        // Return cached color if exists
        if (this.userColors.has(pubkey)) {
            return this.userColors.get(pubkey);
        }

        // Generate unique color based on pubkey hash
        const colorClass = this.generateUniqueColor(pubkey);
        this.userColors.set(pubkey, colorClass);
        return colorClass;
    }

    // Generate a unique color based on pubkey
    generateUniqueColor(pubkey) {
        // Simple hash function for pubkey
        let hash = 0;
        for (let i = 0; i < pubkey.length; i++) {
            hash = pubkey.charCodeAt(i) + ((hash << 5) - hash);
        }

        // Generate HSL color (ensures good visibility)
        const hue = Math.abs(hash) % 360;
        const saturation = 70 + (Math.abs(hash) % 30); // 70-100%
        const lightness = 40 + (Math.abs(hash) % 30);  // 40-70%

        // Create unique class name
        const uniqueClass = `bitchat-user-${Math.abs(hash) % 1000}`;  // Changed prefix

        // Add dynamic style if not exists
        if (!document.getElementById(uniqueClass)) {
            const style = document.createElement('style');
            style.id = uniqueClass;
            style.textContent = `
        .${uniqueClass} {
            color: hsl(${hue}, ${saturation}%, ${lightness}%) !important;
        }
        .${uniqueClass} .nym-suffix {
            color: hsl(${hue}, ${saturation}%, ${lightness}%) !important;
        }
    `;
            document.head.appendChild(style);
        }

        return uniqueClass;
    }

    shareChannel() {
        // Generate the share URL
        const baseUrl = window.location.origin + window.location.pathname;
        const channelPart = this.currentGeohash || this.currentChannel;
        const shareUrl = `${baseUrl}#${channelPart}`;

        // Set the URL in the input
        document.getElementById('shareUrlInput').value = shareUrl;

        // Show the modal
        document.getElementById('shareModal').classList.add('active');

        // Auto-select the text
        setTimeout(() => {
            document.getElementById('shareUrlInput').select();
        }, 100);
    }

    copyShareUrl() {
        const input = document.getElementById('shareUrlInput');
        input.select();

        navigator.clipboard.writeText(input.value).then(() => {
            const btn = document.querySelector('.copy-url-btn');
            const originalText = btn.textContent;
            btn.textContent = 'COPIED!';
            btn.classList.add('copied');

            setTimeout(() => {
                btn.textContent = originalText;
                btn.classList.remove('copied');
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy:', err);
            this.displaySystemMessage('Failed to copy URL');
        });
    }

    shareToTwitter() {
        const url = document.getElementById('shareUrlInput').value;
        const channelName = this.currentGeohash || this.currentChannel;
        const text = `Join me in the #${channelName} channel on NYM - ephemeral Nostr chat`;
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
        window.open(twitterUrl, '_blank');
    }

    shareToNostr() {
        const url = document.getElementById('shareUrlInput').value;
        const channelName = this.currentGeohash || this.currentChannel;
        const content = `Join me in the #${channelName} channel on NYM - ephemeral Nostr chat\n\n${url}`;

        // Copy to clipboard with Nostr note format
        const note = `nostr:note1${content}`;
        navigator.clipboard.writeText(content).then(() => {
            this.displaySystemMessage('Channel link copied for Nostr sharing');
            closeModal('shareModal');
        }).catch(err => {
            console.error('Failed to copy:', err);
            this.displaySystemMessage('Failed to copy for Nostr');
        });
    }

    shareToClipboard() {
        this.copyShareUrl();
    }

    // Add a command for sharing
    cmdShare() {
        this.shareChannel();
    }

    decodeGeohash(geohash) {
        const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
        const bounds = {
            lat: [-90, 90],
            lng: [-180, 180]
        };

        let isEven = true;
        for (let i = 0; i < geohash.length; i++) {
            const cd = BASE32.indexOf(geohash[i].toLowerCase());
            if (cd === -1) throw new Error('Invalid geohash character');

            for (let j = 4; j >= 0; j--) {
                const mask = 1 << j;
                if (isEven) {
                    bounds.lng = (cd & mask) ?
                        [(bounds.lng[0] + bounds.lng[1]) / 2, bounds.lng[1]] :
                        [bounds.lng[0], (bounds.lng[0] + bounds.lng[1]) / 2];
                } else {
                    bounds.lat = (cd & mask) ?
                        [(bounds.lat[0] + bounds.lat[1]) / 2, bounds.lat[1]] :
                        [bounds.lat[0], (bounds.lat[0] + bounds.lat[1]) / 2];
                }
                isEven = !isEven;
            }
        }

        return {
            lat: (bounds.lat[0] + bounds.lat[1]) / 2,
            lng: (bounds.lng[0] + bounds.lng[1]) / 2
        };
    }

    getGeohashLocation(geohash) {
        try {
            const coords = this.decodeGeohash(geohash);
            const lat = coords.lat;
            const lng = coords.lng;

            // Format coordinates properly with N/S and E/W
            const latStr = Math.abs(lat).toFixed(2) + '°' + (lat >= 0 ? 'N' : 'S');
            const lngStr = Math.abs(lng).toFixed(2) + '°' + (lng >= 0 ? 'E' : 'W');

            return `${latStr}, ${lngStr}`;
        } catch (e) {
            console.error('Error decoding geohash:', e);
            return '';
        }
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    isVerifiedDeveloper(pubkey) {
        return pubkey === this.verifiedDeveloper.pubkey;
    }

    validateGeohashInput(input) {
        // Geohash valid characters: 0-9, b-z excluding a, i, l, o
        const validChars = '0123456789bcdefghjkmnpqrstuvwxyz';
        return input.split('').every(char => validChars.includes(char.toLowerCase()));
    }

    // NSEC decode method
    decodeNsec(nsec) {
        try {
            // Use nostr-tools nip19 decode
            if (NostrTools && NostrTools.nip19) {
                const decoded = NostrTools.nip19.decode(nsec);
                if (decoded.type === 'nsec') {
                    return decoded.data;
                }
            }
            throw new Error('Invalid nsec format');
        } catch (error) {
            throw new Error('Failed to decode nsec: ' + error.message);
        }
    }

    updateRelayStatus() {
        const listEl = document.getElementById('connectedRelaysList');
        if (!listEl) return;

        // Group relays by type
        const broadcastRelays = [];
        const readRelays = [];
        const nosflareRelays = [];

        this.relayPool.forEach((relay, url) => {
            if (relay.type === 'broadcast') {
                broadcastRelays.push(url);
            } else if (relay.type === 'nosflare') {
                nosflareRelays.push(url);
            } else if (relay.type === 'read') {
                readRelays.push(url);
            }
        });

        // Calculate total readable relays (broadcast relays can also be read from)
        const totalReadable = broadcastRelays.length + readRelays.length;

        let html = '';

        if (broadcastRelays.length > 0 || nosflareRelays.length > 0) {
            html += '<div style="margin-bottom: 10px;"><strong style="color: var(--primary);">Default Relays:</strong><br>';
            broadcastRelays.forEach(url => {
                html += `<div style="font-size: 11px; margin-left: 10px;">• ${url}</div>`;
            });
            nosflareRelays.forEach(url => {
                html += `<div style="font-size: 11px; margin-left: 10px;">• ${url} (write-only)</div>`;
            });
            html += '</div>';
        }

        if (readRelays.length > 0) {
            html += `<div><strong style="color: var(--secondary);">Additional Read Relays (${readRelays.length}):</strong><br>`;
            readRelays.slice(0, 10).forEach(url => {
                html += `<div style="font-size: 11px; margin-left: 10px;">• ${url}</div>`;
            });
            if (readRelays.length > 10) {
                html += `<div style="font-size: 11px; margin-left: 10px; color: var(--text-dim);">... and ${readRelays.length - 10} more</div>`;
            }
            html += '</div>';
        }

        html += `<div style="margin-top: 10px; font-size: 12px; color: var(--text-bright);">Total Connected: ${this.relayPool.size} relays (${totalReadable} readable)</div>`;

        listEl.innerHTML = html || '<div style="color: var(--text-dim); font-size: 12px;">No relays connected</div>';
    }

    async refreshRelays() {
        this.displaySystemMessage('Refreshing relay list...');
        this.lastRelayDiscovery = 0; // Force refresh
        await this.discoverRelays();
        await this.connectToRelays();
        this.updateRelayStatus();
    }

    isValidGeohash(str) {
        return this.geohashRegex.test(str.toLowerCase());
    }

    getChannelType(channel) {
        if (this.isValidGeohash(channel)) {
            return 'geo';
        }
        return 'standard';
    }

    handleChannelSearch(searchTerm) {
        const term = searchTerm.toLowerCase();
        const resultsDiv = document.getElementById('channelSearchResults');

        // Filter existing channels
        this.filterChannels(term);

        // Show create/join prompt if search term exists
        if (term.length > 0) {
            const isGeohash = this.isValidGeohash(term);
            const type = isGeohash ? 'geohash' : 'channel';
            const exists = Array.from(this.channels.keys()).some(k => k.toLowerCase() === term);

            if (!exists) {
                const prompt = document.createElement('div');
                prompt.className = 'search-create-prompt';
                prompt.innerHTML = `Create or Join ${type} "${term}"`;
                prompt.onclick = async () => {
                    // Add the channel
                    if (isGeohash) {
                        this.addChannel(term, term);
                        this.switchChannel(term, term);
                        this.userJoinedChannels.add(term);
                    } else {
                        this.addChannel(term, '');
                        this.switchChannel(term, '');
                        await this.createChannel(term);
                        this.userJoinedChannels.add(term);
                    }

                    // Clear search
                    document.getElementById('channelSearch').value = '';
                    resultsDiv.innerHTML = '';
                    this.filterChannels('');

                    // Save after joining from search
                    this.saveUserChannels();
                };
                resultsDiv.innerHTML = '';
                resultsDiv.appendChild(prompt);
            } else {
                resultsDiv.innerHTML = '';
            }
        } else {
            resultsDiv.innerHTML = '';
        }
    }

    loadRecentEmojis() {
        const saved = localStorage.getItem('nym_recent_emojis');
        if (saved) {
            this.recentEmojis = JSON.parse(saved);
        }
    }

    saveRecentEmojis() {
        localStorage.setItem('nym_recent_emojis', JSON.stringify(this.recentEmojis.slice(0, 20)));
    }

    addToRecentEmojis(emoji) {
        // Remove if already exists
        this.recentEmojis = this.recentEmojis.filter(e => e !== emoji);
        // Add to beginning
        this.recentEmojis.unshift(emoji);
        // Keep only 20 recent
        this.recentEmojis = this.recentEmojis.slice(0, 20);
        this.saveRecentEmojis();
    }

    async initialize() {
        try {
            // Check if nostr-tools is loaded
            if (typeof NostrTools === 'undefined') {
                throw new Error('nostr-tools not loaded');
            }

            // Setup event listeners
            this.setupEventListeners();
            this.setupCommands();
            this.setupEmojiPicker();
            this.setupContextMenu();
            this.setupMobileGestures();

            // Load saved preferences
            this.applyTheme(this.settings.theme);
            this.loadBlockedUsers();
            this.loadBlockedKeywords();
            this.loadBlockedChannels();
            this.loadPinnedChannels();

            // Load lightning address
            await this.loadLightningAddress();

            // Clean up old localStorage format
            this.cleanupOldLightningAddress();

            console.log('NYM initialized successfully');
        } catch (error) {
            console.error('Failed to initialize NYM:', error);
            this.showNotification('Error', 'Failed to initialize: ' + error.message);
        }
    }

    setupMobileGestures() {
        if (window.innerWidth <= 768) {
            // Touch events for swipe to open menu
            document.addEventListener('touchstart', (e) => {
                const touch = e.touches[0];
                // Only track swipes starting from left edge
                if (touch.clientX < 50) {
                    this.swipeStartX = touch.clientX;
                }
            });

            document.addEventListener('touchmove', (e) => {
                if (this.swipeStartX !== null) {
                    const touch = e.touches[0];
                    const swipeDistance = touch.clientX - this.swipeStartX;

                    if (swipeDistance > this.swipeThreshold) {
                        this.toggleSidebar();
                        this.swipeStartX = null;
                    }
                }
            });

            document.addEventListener('touchend', () => {
                this.swipeStartX = null;
            });
        }
    }

    closeSidebar() {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.remove('open');
        document.getElementById('mobileOverlay').classList.remove('active');
    }

    setupContextMenu() {
        // Close context menu on click outside - using event delegation
        document.addEventListener('click', (e) => {
            const contextMenu = document.getElementById('contextMenu');

            // Only proceed if context menu is actually active
            if (!contextMenu.classList.contains('active')) {
                return;
            }

            // If clicking outside the context menu and not on enhanced emoji modal
            if (!e.target.closest('.context-menu') && !e.target.closest('.enhanced-emoji-modal')) {
                contextMenu.classList.remove('active');
            }
        });

        // Context menu actions
        document.getElementById('ctxMention').addEventListener('click', () => {
            if (this.contextMenuData) {
                const baseNym = this.contextMenuData.nym.split('#')[0] || this.contextMenuData.nym;
                const pubkey = this.contextMenuData.pubkey;
                const suffix = this.getPubkeySuffix(pubkey);
                const fullNym = `${baseNym}#${suffix}`;
                this.insertMention(fullNym);
            }
            document.getElementById('contextMenu').classList.remove('active');
        });


        document.getElementById('ctxPM').addEventListener('click', () => {
            if (this.contextMenuData) {
                // Include suffix when opening PM
                const baseNym = this.contextMenuData.nym.split('#')[0] || this.contextMenuData.nym;
                const suffix = this.getPubkeySuffix(this.contextMenuData.pubkey);
                const fullNym = `${baseNym}#${suffix}`;
                this.openUserPM(fullNym, this.contextMenuData.pubkey);
            }
            document.getElementById('contextMenu').classList.remove('active');
        });

        // Add zap handler
        document.getElementById('ctxZap').addEventListener('click', async () => {
            if (this.contextMenuData && this.contextMenuData.messageId) {
                const { messageId, pubkey, nym } = this.contextMenuData;

                // Close context menu immediately
                document.getElementById('contextMenu').classList.remove('active');

                // Show loading message
                this.displaySystemMessage(`Checking if @${nym} can receive zaps...`);

                try {
                    // Always fetch fresh to ensure we have the latest
                    const lnAddress = await this.fetchLightningAddressForUser(pubkey);

                    if (lnAddress) {
                        // User has lightning address, show zap modal
                        this.showZapModal(messageId, pubkey, nym);
                    } else {
                        // No lightning address found
                        this.displaySystemMessage(`@${nym} cannot receive zaps (no lightning address set)`);
                    }
                } catch (error) {
                    console.error('Error fetching lightning address:', error);
                    this.displaySystemMessage(`Failed to check if @${nym} can receive zaps`);
                }
            }
        });

        // Add slap handler
        let slapOption = document.getElementById('ctxSlap');
        if (!slapOption) {
            // Create slap option if it doesn't exist
            slapOption = document.createElement('div');
            slapOption.className = 'context-menu-item';
            slapOption.id = 'ctxSlap';
            slapOption.textContent = 'Slap with Trout';

            // Insert after PM option
            const pmOption = document.getElementById('ctxPM');
            if (pmOption && pmOption.nextSibling) {
                pmOption.parentNode.insertBefore(slapOption, pmOption.nextSibling);
            } else if (pmOption) {
                pmOption.parentNode.appendChild(slapOption);
            }
        }

        // Add the click handler for slap
        slapOption.addEventListener('click', () => {
            if (this.contextMenuData) {
                this.cmdSlap(this.contextMenuData.nym);
            }
            document.getElementById('contextMenu').classList.remove('active');
        });

        document.getElementById('ctxReact').addEventListener('click', () => {
            if (this.contextMenuData && this.contextMenuData.messageId) {
                document.getElementById('contextMenu').classList.remove('active');

                // Use a delay to ensure context menu closes first
                setTimeout(() => {
                    // Create a temporary button element for positioning (centered for mobile)
                    const tempButton = document.createElement('button');
                    tempButton.style.position = 'fixed';
                    tempButton.style.left = '50%';
                    tempButton.style.bottom = '50%';
                    tempButton.style.opacity = '0';
                    tempButton.style.pointerEvents = 'none';
                    document.body.appendChild(tempButton);

                    this.showEnhancedReactionPicker(this.contextMenuData.messageId, tempButton);

                    // Remove temp button after modal is created
                    setTimeout(() => tempButton.remove(), 100);
                }, 100);
            }
        });

        document.getElementById('ctxQuote').addEventListener('click', () => {
            if (this.contextMenuData && this.contextMenuData.content) {
                const input = document.getElementById('messageInput');
                // Include the pubkey suffix in the quote
                const baseNym = this.contextMenuData.nym.split('#')[0] || this.contextMenuData.nym;
                const suffix = this.getPubkeySuffix(this.contextMenuData.pubkey);
                const fullNym = `${baseNym}#${suffix}`;
                input.value = `> @${fullNym}: ${this.contextMenuData.content}\n\n`;
                input.focus();
            }
            document.getElementById('contextMenu').classList.remove('active');
        });

        document.getElementById('ctxBlock').addEventListener('click', () => {
            if (this.contextMenuData) {
                this.cmdBlock(this.contextMenuData.nym);
            }
            document.getElementById('contextMenu').classList.remove('active');
        });
    }

    showContextMenu(e, nym, pubkey, content = null, messageId = null) {
        e.preventDefault();
        e.stopPropagation();

        const menu = document.getElementById('contextMenu');
        // Parse base nym from display format
        const parsedNym = this.parseNymFromDisplay(nym);
        this.contextMenuData = { nym: parsedNym, pubkey, content, messageId };

        // Add slap option if it doesn't exist
        let slapOption = document.getElementById('ctxSlap');
        if (!slapOption) {
            // Create slap option
            slapOption = document.createElement('div');
            slapOption.className = 'context-menu-item';
            slapOption.id = 'ctxSlap';
            slapOption.textContent = 'Slap with Trout';

            // Insert after PM option
            const pmOption = document.getElementById('ctxPM');
            if (pmOption && pmOption.nextSibling) {
                pmOption.parentNode.insertBefore(slapOption, pmOption.nextSibling);
            } else if (pmOption) {
                pmOption.parentNode.appendChild(slapOption);
            }
        }

        // Show slap option only if not yourself
        slapOption.style.display = pubkey === this.pubkey ? 'none' : 'block';

        // Add zap option handling
        const zapOption = document.getElementById('ctxZap');
        if (zapOption) {
            // Show zap option if:
            // 1. Not your own message
            // 2. Has a valid message ID
            if (pubkey !== this.pubkey && messageId) {
                zapOption.style.display = 'block';
            } else {
                zapOption.style.display = 'none';
            }
        }

        // Hide block option if it's your own message
        const blockOption = document.getElementById('ctxBlock');
        if (pubkey === this.pubkey) {
            blockOption.style.display = 'none';
        } else {
            blockOption.style.display = 'block';
            blockOption.textContent = this.blockedUsers.has(nym) ? 'Unblock User' : 'Block User';
        }

        // Hide PM option if it's yourself
        document.getElementById('ctxPM').style.display = pubkey === this.pubkey ? 'none' : 'block';

        // Show/hide quote option
        document.getElementById('ctxQuote').style.display = content ? 'block' : 'none';

        // Show/hide React option
        const reactOption = document.getElementById('ctxReact');
        reactOption.style.display = messageId ? 'block' : 'none';

        // Add active class first to make visible
        menu.classList.add('active');

        // Get dimensions after making visible
        const menuRect = menu.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        const windowWidth = window.innerWidth;

        let top = e.pageY;
        let left = e.pageX;

        // Check if menu would go off bottom of screen
        if (top + menuRect.height > windowHeight) {
            top = windowHeight - menuRect.height - 10;
        }

        // Check if menu would go off right of screen
        if (left + menuRect.width > windowWidth) {
            left = windowWidth - menuRect.width - 10;
        }

        // Ensure menu doesn't go off top or left
        top = Math.max(10, top);
        left = Math.max(10, left);

        menu.style.left = left + 'px';
        menu.style.top = top + 'px';

        // Prevent the click from immediately closing the menu
        e.stopImmediatePropagation();
    }

    showMobileReactionPicker(messageId) {
        const picker = document.createElement('div');
        picker.className = 'reaction-picker active';
        picker.style.position = 'fixed';
        picker.style.bottom = '50%';
        picker.style.left = '50%';
        picker.style.transform = 'translate(-50%, 50%)';
        picker.style.zIndex = '1001';
        picker.style.display = 'grid';
        picker.style.gridTemplateColumns = 'repeat(5, 1fr)';

        picker.innerHTML = ['👍', '❤️', '😂', '🔥', '👎', '😮', '🤔', '💯', '🎉', '👏'].map(emoji =>
            `<button class="reaction-emoji" onclick="nym.sendReaction('${messageId}', '${emoji}'); this.parentElement.remove();">${emoji}</button>`
        ).join('');

        document.body.appendChild(picker);

        // Close on click outside
        setTimeout(() => {
            document.addEventListener('click', (e) => {
                if (!picker.contains(e.target)) {
                    picker.remove();
                }
            }, { once: true });
        }, 100);
    }

    loadBlockedKeywords() {
        const saved = localStorage.getItem('nym_blocked_keywords');
        if (saved) {
            this.blockedKeywords = new Set(JSON.parse(saved));
        }
        this.updateKeywordList();
    }

    saveBlockedKeywords() {
        localStorage.setItem('nym_blocked_keywords', JSON.stringify(Array.from(this.blockedKeywords)));
    }

    addBlockedKeyword() {
        const input = document.getElementById('newKeywordInput');
        const keyword = input.value.trim().toLowerCase();

        if (keyword) {
            this.blockedKeywords.add(keyword);
            this.saveBlockedKeywords();
            this.updateKeywordList();
            input.value = '';

            // Hide messages containing this keyword
            document.querySelectorAll('.message').forEach(msg => {
                const content = msg.querySelector('.message-content');
                if (content && content.textContent.toLowerCase().includes(keyword)) {
                    msg.classList.add('blocked');
                }
            });

            this.displaySystemMessage(`Blocked keyword: "${keyword}"`);

            // Sync to Nostr for persistent connections
            if (this.connectionMode !== 'ephemeral') {
                this.saveSyncedSettings();
            }
        }
    }

    removeBlockedKeyword(keyword) {
        this.blockedKeywords.delete(keyword);
        this.saveBlockedKeywords();
        this.updateKeywordList();

        // Re-check all messages
        document.querySelectorAll('.message').forEach(msg => {
            const author = msg.dataset.author;
            const content = msg.querySelector('.message-content');

            if (content && !this.blockedUsers.has(author)) {
                const hasBlockedKeyword = Array.from(this.blockedKeywords).some(kw =>
                    content.textContent.toLowerCase().includes(kw)
                );

                if (!hasBlockedKeyword) {
                    msg.classList.remove('blocked');
                }
            }
        });

        this.displaySystemMessage(`Unblocked keyword: "${keyword}"`);

        // Sync to Nostr for persistent connections
        if (this.connectionMode !== 'ephemeral') {
            this.saveSyncedSettings();
        }
    }

    updateKeywordList() {
        const list = document.getElementById('keywordList');
        if (this.blockedKeywords.size === 0) {
            list.innerHTML = '<div style="color: var(--text-dim); font-size: 12px;">No blocked keywords</div>';
        } else {
            list.innerHTML = Array.from(this.blockedKeywords).map(keyword => `
                <div class="keyword-item">
                    <span>${this.escapeHtml(keyword)}</span>
                    <button class="remove-keyword-btn" onclick="nym.removeBlockedKeyword('${this.escapeHtml(keyword).replace(/'/g, "\\'")}')">Remove</button>
                </div>
            `).join('');
        }
    }

    hasBlockedKeyword(text) {
        const lowerText = text.toLowerCase();
        return Array.from(this.blockedKeywords).some(keyword => lowerText.includes(keyword));
    }

    generateRandomNym() {
        const adjectives = [
            'quantum', 'neon', 'cyber', 'shadow', 'plasma',
            'echo', 'nexus', 'void', 'flux', 'ghost',
            'phantom', 'stealth', 'cryptic', 'dark', 'neural',
            'binary', 'matrix', 'digital', 'virtual', 'zero',
            'null', 'anon', 'masked', 'hidden', 'cipher',
            'enigma', 'spectral', 'rogue', 'omega', 'alpha',
            'delta', 'sigma', 'vortex', 'turbo', 'razor',
            'blade', 'frost', 'storm', 'glitch', 'pixel'
        ];

        const nouns = [
            'ghost', 'nomad', 'drift', 'pulse', 'wave',
            'spark', 'node', 'byte', 'mesh', 'link',
            'runner', 'hacker', 'coder', 'agent', 'proxy',
            'daemon', 'virus', 'worm', 'bot', 'droid',
            'reaper', 'shadow', 'wraith', 'specter', 'shade',
            'entity', 'unit', 'core', 'nexus', 'cypher',
            'breach', 'exploit', 'overflow', 'inject', 'root',
            'kernel', 'shell', 'terminal', 'console', 'script'
        ];

        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];

        return `${adj}_${noun}`;
    }

    formatNymWithPubkey(nym, pubkey) {
        // If nym already has a # suffix, don't add another
        if (nym.includes('#')) {
            return nym;
        }

        // Get last 4 characters of pubkey
        const suffix = pubkey ? pubkey.slice(-4) : '????';
        return `${nym}<span class="nym-suffix">#${suffix}</span>`;
    }

    getPubkeySuffix(pubkey) {
        return pubkey ? pubkey.slice(-4) : '????';
    }

    parseNymFromDisplay(displayNym) {
        return displayNym.replace(/<span class="nym-suffix">.*?<\/span>/g, '');
    }

    async connectToRelays() {
        try {
            this.updateConnectionStatus('Connecting...');

            // Check if we're already connected to ANY broadcast relay from pre-connection
            let initialConnected = false;
            let connectedRelayUrl = null;

            for (const relayUrl of this.broadcastRelays) {
                if (this.relayPool.has(relayUrl)) {
                    const relay = this.relayPool.get(relayUrl);
                    if (relay && relay.ws && relay.ws.readyState === WebSocket.OPEN) {
                        initialConnected = true;
                        connectedRelayUrl = relayUrl;
                        console.log(`Already connected to ${relayUrl} from pre-connection`);
                        break;
                    }
                }
            }

            // If not already connected, try to connect to broadcast relays one by one
            if (!initialConnected) {
                for (const relayUrl of this.broadcastRelays) {
                    if (!this.shouldRetryRelay(relayUrl)) {
                        console.log(`Skipping broadcast relay ${relayUrl} - waiting for retry delay`);
                        continue;
                    }

                    try {
                        await this.connectToRelayWithTimeout(relayUrl, 'broadcast', 2000);
                        initialConnected = true;
                        connectedRelayUrl = relayUrl;
                        console.log(`Initially connected to ${relayUrl}`);
                        break;
                    } catch (err) {
                        console.log(`Failed to connect to ${relayUrl}, trying next...`);
                        this.trackRelayFailure(relayUrl);
                    }
                }
            }

            if (!initialConnected) {
                throw new Error('Could not connect to any broadcast relay');
            }

            // Enable input immediately after first relay connects
            document.getElementById('messageInput').disabled = false;
            document.getElementById('sendBtn').disabled = false;
            this.connected = true;

            // Start subscriptions on all connected relays
            this.subscribeToAllRelays();

            // Update status to show we're connected
            this.updateConnectionStatus();
            this.displaySystemMessage(`Connected to the Nostr network via multiple relays...`);

            // Load synced settings for persistent connections
            if (this.connectionMode !== 'ephemeral') {
                // Wait a bit longer to ensure relays are ready
                setTimeout(() => {
                    this.loadSyncedSettings();
                }, 2000); // Increased from 1000ms
            }

            // Now connect to remaining broadcast relays in background
            this.broadcastRelays.forEach(relayUrl => {
                if (!this.relayPool.has(relayUrl) && this.shouldRetryRelay(relayUrl)) {
                    this.connectToRelay(relayUrl, 'broadcast')
                        .then(() => {
                            this.subscribeToSingleRelay(relayUrl);
                            this.updateConnectionStatus();
                        })
                        .catch(err => {
                            console.log(`Failed to connect to ${relayUrl}:`, err);
                            this.trackRelayFailure(relayUrl);
                        });
                }
            });

            // Connect to nosflare for sending only (no subscriptions)
            if (this.shouldRetryRelay(this.nosflareRelay)) {
                this.connectToRelay(this.nosflareRelay, 'nosflare')
                    .then(() => {
                        console.log('Connected to nosflare for broadcasting');
                        this.updateConnectionStatus();
                    })
                    .catch(err => {
                        console.log(`Failed to connect to nosflare:`, err);
                        this.trackRelayFailure(this.nosflareRelay);
                    });
            }

            // Discover additional relays in the background
            setTimeout(() => {
                this.discoverRelays().then(() => {
                    // Connect to discovered relays for additional reading sources
                    const relaysToConnect = Array.from(this.discoveredRelays)
                        .filter(url => !this.relayPool.has(url) && this.shouldRetryRelay(url))
                        .slice(0, this.maxRelaysForReq);

                    if (relaysToConnect.length > 0) {
                        // Stagger connections to avoid overwhelming the browser
                        relaysToConnect.forEach((relayUrl, index) => {
                            setTimeout(() => {
                                this.connectToRelayWithTimeout(relayUrl, 'read', this.relayTimeout)
                                    .then(() => {
                                        this.subscribeToSingleRelay(relayUrl);
                                        this.updateConnectionStatus();
                                    })
                                    .catch(err => {
                                        console.log(`Failed to connect to ${relayUrl}:`, err);
                                        this.trackRelayFailure(relayUrl);
                                    });
                            }, index * 100);
                        });
                    }
                });
            }, 100);

        } catch (error) {
            console.error('Failed to connect to relays:', error);
            this.updateConnectionStatus('Connection Failed');
            this.displaySystemMessage('Failed to connect to relays: ' + error.message);

            // Re-enable input anyway in case user wants to retry
            document.getElementById('messageInput').disabled = false;
            document.getElementById('sendBtn').disabled = false;
        }
    }

    async quickConnect() {
        // Try broadcast relays in order with very short timeout
        for (const relayUrl of this.broadcastRelays) {
            if (!this.shouldRetryRelay(relayUrl)) {
                console.log(`Skipping quick connect to ${relayUrl} - waiting for retry delay`);
                continue;
            }

            try {
                await this.connectToRelayWithTimeout(relayUrl, 'broadcast', 1500); // 1.5 second timeout

                // Enable input immediately
                document.getElementById('messageInput').disabled = false;
                document.getElementById('sendBtn').disabled = false;
                this.connected = true;

                // Start subscriptions
                this.subscribeToSingleRelay(relayUrl);

                this.updateConnectionStatus();
                console.log(`Quick connected to ${relayUrl}`);
                return true;
            } catch (err) {
                console.log(`Quick connect failed to ${relayUrl}, trying next...`);
                this.trackRelayFailure(relayUrl);
            }
        }

        return false; // All broadcast relays failed
    }

    subscribeToSingleRelay(relayUrl) {
        const relay = this.relayPool.get(relayUrl);
        if (!relay || !relay.ws || relay.ws.readyState !== WebSocket.OPEN) return;

        // Never send REQ to nosflare
        if (relay.type === 'nosflare') return;

        const ws = relay.ws;

        // Subscribe to messages
        const messagesSub = [
            "REQ",
            "msgs-" + Math.random().toString(36).substring(2),
            {
                kinds: [20000, 23333],
                limit: 200
            }
        ];
        ws.send(JSON.stringify(messagesSub));

        // Subscribe to reactions with k tag filter
        const reactionsSub = [
            "REQ",
            "reactions-" + Math.random().toString(36).substring(2),
            {
                kinds: [7],
                "#k": ["20000", "23333", "4"], // Only reactions for our kinds
                limit: 1000,
                since: Math.floor(Date.now() / 1000) - 7200
            }
        ];
        ws.send(JSON.stringify(reactionsSub));

        // Subscribe to ALL zap receipts (they contain the e tag for message ID)
        const zapsSub = [
            "REQ",
            "zaps-" + Math.random().toString(36).substring(2),
            {
                kinds: [9735], // Zap receipt events
                limit: 1000,
                since: Math.floor(Date.now() / 1000) - 86400 // Last 24 hours
            }
        ];
        ws.send(JSON.stringify(zapsSub));

        // Subscribe to PMs if we have a pubkey
        if (this.pubkey) {
            const pmSub = [
                "REQ",
                "pms-" + Math.random().toString(36).substring(2),
                {
                    kinds: [4],
                    "#p": [this.pubkey],
                    limit: 50
                }
            ];
            ws.send(JSON.stringify(pmSub));
        }
    }

    async connectToRelayWithTimeout(relayUrl, type, timeout) {
        return Promise.race([
            this.connectToRelay(relayUrl, type),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout connecting to ${relayUrl}`)), timeout)
            )
        ]);
    }

    shouldRetryRelay(relayUrl) {
        const failedAttempt = this.failedRelays.get(relayUrl);
        if (!failedAttempt) return true; // Never failed before, OK to retry

        const now = Date.now();
        return now - failedAttempt > this.relayRetryDelay; // Check if enough time has passed
    }

    trackRelayFailure(relayUrl) {
        this.failedRelays.set(relayUrl, Date.now());
    }

    clearRelayFailure(relayUrl) {
        this.failedRelays.delete(relayUrl);
    }

    async connectToRelay(relayUrl, type = 'read') {
        return new Promise((resolve, reject) => {
            try {
                // Check if blacklisted but also check if expired
                if (this.blacklistedRelays.has(relayUrl)) {
                    if (!this.isBlacklistExpired(relayUrl)) {
                        // Still blacklisted
                        resolve();
                        return;
                    }
                    // Was expired and removed, continue connecting
                }

                if (!this.shouldRetryRelay(relayUrl)) {
                    console.log(`Skipping relay ${relayUrl} - waiting for retry delay to expire`);
                    resolve();
                    return;
                }

                // Skip if already connected
                if (this.relayPool.has(relayUrl)) {
                    resolve();
                    return;
                }

                const ws = new WebSocket(relayUrl);
                let verificationTimeout;

                ws.onopen = () => {
                    this.relayPool.set(relayUrl, {
                        ws,
                        type,
                        status: 'connected',
                        connectedAt: Date.now() // Track when connected
                    });
                    console.log(`Connected to ${type} relay: ${relayUrl}`);

                    this.clearRelayFailure(relayUrl);

                    // For broadcast/nosflare relays, just resolve
                    if (type === 'broadcast' || type === 'nosflare') {
                        resolve();
                        return;
                    }

                    // For read relays, set up verification timeout
                    if (type === 'read') {
                        // Initialize kinds tracking for this relay
                        this.relayKinds.set(relayUrl, new Set());

                        // Set timeout to check if relay sends our required kinds
                        verificationTimeout = setTimeout(() => {
                            const receivedKinds = this.relayKinds.get(relayUrl);
                            const hasRequiredKinds =
                                receivedKinds.has(20000) || // geohash channels
                                receivedKinds.has(23333) || // standard channels  
                                receivedKinds.has(7) ||     // reactions (with proper k tags)
                                receivedKinds.has(4);       // PMs

                            if (!hasRequiredKinds) {
                                console.log(`Relay ${relayUrl} hasn't sent any required kinds, closing connection`);
                                ws.close();
                                this.relayPool.delete(relayUrl);
                                this.relayKinds.delete(relayUrl);
                                this.blacklistedRelays.add(relayUrl);
                                this.blacklistTimestamps.set(relayUrl, Date.now()); // Track when blacklisted
                                this.updateConnectionStatus();
                            }
                        }, this.relayVerificationTimeout);
                    }

                    resolve();
                };

                ws.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        this.handleRelayMessage(msg, relayUrl);
                    } catch (e) {
                        console.error(`Failed to parse message from ${relayUrl}:`, e);
                    }
                };

                ws.onerror = (error) => {
                    console.error(`WebSocket error for ${relayUrl}:`, error);
                    clearTimeout(verificationTimeout);
                    reject(error);
                };

                ws.onclose = () => {
                    clearTimeout(verificationTimeout);
                    this.relayPool.delete(relayUrl);
                    this.relayKinds.delete(relayUrl);
                    console.log(`Disconnected from ${relayUrl}`);

                    // Only reconnect broadcast/nosflare relays, not failed read relays
                    if ((type === 'broadcast' || type === 'nosflare') && this.connected && !this.blacklistedRelays.has(relayUrl)) {
                        // Track disconnections
                        if (!this.reconnectingRelays) {
                            this.reconnectingRelays = new Set();
                        }

                        this.reconnectingRelays.add(relayUrl);

                        setTimeout(() => {
                            this.connectToRelay(relayUrl, type)
                                .then(() => {
                                    // Re-subscribe after reconnection
                                    if (type === 'broadcast') {
                                        this.subscribeToSingleRelay(relayUrl);
                                    }
                                    console.log(`Reconnected to ${relayUrl}`);
                                    this.updateConnectionStatus();

                                    // Remove from reconnecting set
                                    this.reconnectingRelays.delete(relayUrl);

                                    // Show reconnected message only when all relays are back
                                    if (this.reconnectingRelays.size === 0) {

                                        // After broadcast relays reconnect, also retry discovered relays
                                        if (type === 'broadcast') {
                                            setTimeout(() => {
                                                this.retryDiscoveredRelays();
                                            }, 2000); // Wait 2 seconds before retrying discovered relays
                                        }
                                    }
                                })
                                .catch(err => {
                                    console.error(`Failed to reconnect to ${relayUrl}:`, err);
                                    this.trackRelayFailure(relayUrl);
                                    // Keep trying, but don't spam messages
                                });
                        }, 5000);
                    }
                };

            } catch (error) {
                console.error(`Connection failed for ${relayUrl}:`, error);
                this.trackRelayFailure(relayUrl);
                reject(error);
            }
        });
    }

    isBlacklistExpired(relayUrl) {
        if (!this.blacklistTimestamps.has(relayUrl)) {
            return true; // Not in timestamp map, shouldn't be blacklisted
        }

        const blacklistedAt = this.blacklistTimestamps.get(relayUrl);
        const now = Date.now();

        if (now - blacklistedAt > this.blacklistDuration) {
            // Expired, remove from blacklist
            this.blacklistedRelays.delete(relayUrl);
            this.blacklistTimestamps.delete(relayUrl);
            return true;
        }

        return false;
    }

    async retryDiscoveredRelays() {
        console.log('Retrying discovered relays after reconnection...');

        // Clean expired blacklist entries first
        for (const relayUrl of this.blacklistedRelays) {
            this.isBlacklistExpired(relayUrl);
        }

        // Try to connect to any discovered relays we're not connected to
        const relaysToTry = [];

        // From previously discovered relays (this is the main source)
        for (const relay of this.discoveredRelays) {
            if (!this.relayPool.has(relay) &&
                !this.blacklistedRelays.has(relay) &&
                !this.broadcastRelays.includes(relay) &&
                relay !== this.nosflareRelay &&
                !relaysToTry.includes(relay) &&
                this.shouldRetryRelay(relay)) {
                relaysToTry.push(relay);
            }
        }

        if (relaysToTry.length > 0) {
            console.log(`Found ${relaysToTry.length} discovered relays to retry`);

            // Try connecting to them with staggered timing
            for (let i = 0; i < Math.min(relaysToTry.length, 20); i++) { // Try up to 20 relays
                const relayUrl = relaysToTry[i];
                setTimeout(() => {
                    this.connectToRelayWithTimeout(relayUrl, 'read', this.relayTimeout)
                        .then(() => {
                            this.subscribeToSingleRelay(relayUrl);
                            console.log(`Reconnected to discovered relay: ${relayUrl}`);
                            this.updateConnectionStatus();
                        })
                        .catch(err => {
                            console.log(`Failed to reconnect to ${relayUrl}:`, err);
                            this.trackRelayFailure(relayUrl);
                        });
                }, i * 200); // Stagger by 200ms
            }
        } else {
            console.log('No discovered relays to retry');

            // If we have no discovered relays, try to discover them again
            this.discoverRelays().then(() => {
                // After discovery, try connecting to newly discovered relays
                const newRelaysToTry = Array.from(this.discoveredRelays)
                    .filter(url => !this.relayPool.has(url) &&
                        !this.blacklistedRelays.has(url) &&
                        !this.broadcastRelays.includes(url) &&
                        url !== this.nosflareRelay &&
                        this.shouldRetryRelay(url))
                    .slice(0, 10);

                if (newRelaysToTry.length > 0) {
                    console.log(`Found ${newRelaysToTry.length} newly discovered relays to connect`);
                    newRelaysToTry.forEach((relayUrl, index) => {
                        setTimeout(() => {
                            this.connectToRelayWithTimeout(relayUrl, 'read', this.relayTimeout)
                                .then(() => {
                                    this.subscribeToSingleRelay(relayUrl);
                                    console.log(`Connected to newly discovered relay: ${relayUrl}`);
                                    this.updateConnectionStatus();
                                })
                                .catch(err => {
                                    console.log(`Failed to connect to ${relayUrl}:`, err);
                                    this.trackRelayFailure(relayUrl);
                                });
                        }, index * 200);
                    });
                }
            });
        }
    }

    syncMissingMessages() {
        // For current channel, check if stored messages are displayed
        const currentKey = this.currentGeohash ? `#${this.currentGeohash}` : this.currentChannel;
        const storedMessages = this.messages.get(currentKey) || [];

        storedMessages.forEach(message => {
            // Check if message is already in DOM
            if (!document.querySelector(`[data-message-id="${message.id}"]`)) {
                // Message is stored but not displayed, display it now
                this.displayMessage(message);
            }
        });

        // For PMs if in PM mode
        if (this.inPMMode && this.currentPM) {
            const conversationKey = this.getPMConversationKey(this.currentPM);
            const pmMessages = this.pmMessages.get(conversationKey) || [];

            pmMessages.forEach(message => {
                if (!document.querySelector(`[data-message-id="${message.id}"]`)) {
                    this.displayMessage(message);
                }
            });
        }
    }

    // Generate QR code for invoice
    generateQRCode(text, elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;

        // Create QR code using canvas
        QRCode.toCanvas(element, text, {
            width: 256,
            height: 256,
            color: {
                dark: "#000000",
                light: "#ffffff",
            },
            errorCorrectionLevel: 'L'
        });
    }

    // Fetch invoice from LNURL
    async fetchLightningInvoice(lnAddress, amountSats, comment) {
        try {
            const [username, domain] = lnAddress.split('@');
            if (!username || !domain) {
                throw new Error('Invalid lightning address format');
            }

            // Fetch LNURL endpoint
            const lnurlResponse = await fetch(`https://${domain}/.well-known/lnurlp/${username}`);
            if (!lnurlResponse.ok) {
                throw new Error('Failed to fetch LNURL endpoint');
            }

            const lnurlData = await lnurlResponse.json();

            // Convert sats to millisats
            const amountMillisats = parseInt(amountSats) * 1000;

            // Check bounds
            if (amountMillisats < lnurlData.minSendable || amountMillisats > lnurlData.maxSendable) {
                throw new Error(`Amount must be between ${lnurlData.minSendable / 1000} and ${lnurlData.maxSendable / 1000} sats`);
            }

            // Build callback URL
            const callbackUrl = new URL(lnurlData.callback);
            callbackUrl.searchParams.set('amount', amountMillisats);

            // Add comment if allowed
            if (comment && lnurlData.commentAllowed) {
                callbackUrl.searchParams.set('comment', comment.substring(0, lnurlData.commentAllowed));
            }

            // Add nostr params for zap
            if (lnurlData.allowsNostr && lnurlData.nostrPubkey) {
                // Create zap request event
                const zapRequest = await this.createZapRequest(amountSats, comment);
                if (zapRequest) {
                    callbackUrl.searchParams.set('nostr', JSON.stringify(zapRequest));
                }
            }

            // Fetch invoice
            const invoiceResponse = await fetch(callbackUrl.toString());
            if (!invoiceResponse.ok) {
                throw new Error('Failed to fetch invoice');
            }

            const invoiceData = await invoiceResponse.json();

            if (invoiceData.pr) {
                return {
                    pr: invoiceData.pr,
                    successAction: invoiceData.successAction,
                    verify: invoiceData.verify,
                    amount: amountSats
                };
            } else {
                throw new Error('No payment request in response');
            }
        } catch (error) {
            console.error('Error fetching lightning invoice:', error);
            throw error;
        }
    }

    async fetchLightningAddressForUser(pubkey) {
        // Check if already cached
        if (this.userLightningAddresses.has(pubkey)) {
            return this.userLightningAddresses.get(pubkey);
        }

        return new Promise((resolve) => {
            const subId = "ln-addr-" + Math.random().toString(36).substring(2);
            let foundAddress = false;
            let messageHandlers = [];

            const cleanup = () => {
                // Restore original handlers
                messageHandlers.forEach(handler => {
                    const index = this.relayMessageHandlers?.indexOf(handler);
                    if (index > -1) {
                        this.relayMessageHandlers.splice(index, 1);
                    }
                });
                // Close subscription
                this.sendToRelay(["CLOSE", subId]);
            };

            const timeout = setTimeout(() => {
                console.log('Timeout: No lightning address found for user');
                cleanup();
                resolve(null);
            }, 5000); // Increased to 5 seconds for slower relays

            // Create handler for this specific request
            const handleMessage = (msg, relayUrl) => {
                if (!Array.isArray(msg)) return;

                const [type, ...data] = msg;

                if (type === 'EVENT' && data[0] === subId) {
                    const event = data[1];
                    if (event && event.kind === 0 && event.pubkey === pubkey) {
                        try {
                            const profile = JSON.parse(event.content);

                            // Check for lightning address
                            if (profile.lud16 || profile.lud06) {
                                const lnAddress = profile.lud16 || profile.lud06;
                                // Cache it for future use
                                this.userLightningAddresses.set(pubkey, lnAddress);
                                console.log(`Found lightning address for ${pubkey}:`, lnAddress);

                                if (!foundAddress) {
                                    foundAddress = true;
                                    clearTimeout(timeout);
                                    cleanup();
                                    resolve(lnAddress);
                                }
                                return true; // Handled
                            }
                        } catch (e) {
                            console.error('Failed to parse profile:', e);
                        }
                    }
                } else if (type === 'EOSE' && data[0] === subId) {
                    // End of stored events from this relay
                    // Don't resolve null yet - wait for other relays or timeout
                    console.log(`EOSE received from ${relayUrl} for lightning address lookup`);
                }

                return false; // Not handled
            };

            // Hook into relay message handling
            if (!this.relayMessageHandlers) {
                this.relayMessageHandlers = [];
                const originalHandler = this.handleRelayMessage.bind(this);
                this.handleRelayMessage = (msg, relayUrl) => {
                    // Process through handlers
                    let handled = false;
                    for (const handler of this.relayMessageHandlers) {
                        if (handler(msg, relayUrl)) {
                            handled = true;
                            break;
                        }
                    }
                    // Always call original handler
                    originalHandler(msg, relayUrl);
                };
            }

            // Add our handler
            this.relayMessageHandlers.push(handleMessage);
            messageHandlers.push(handleMessage);

            // Request the user's profile from ALL connected relays
            const subscription = [
                "REQ",
                subId,
                {
                    kinds: [0],
                    authors: [pubkey],
                    limit: 1
                }
            ];

            // Send to all connected relays
            this.sendToRelay(subscription);
        });
    }

    async loadLightningAddress() {
        // Only load if we have a pubkey
        if (!this.pubkey) return;

        // First, try to load from pubkey-specific localStorage
        const saved = localStorage.getItem(`nym_lightning_address_${this.pubkey}`);
        if (saved) {
            this.lightningAddress = saved;
            this.updateLightningAddressDisplay();
            return;
        }

        // If not in localStorage, try to fetch from Nostr profile
        const profileAddress = await this.fetchLightningAddressForUser(this.pubkey);
        if (profileAddress) {
            this.lightningAddress = profileAddress;
            // Cache it in localStorage for this pubkey
            localStorage.setItem(`nym_lightning_address_${this.pubkey}`, profileAddress);
            this.updateLightningAddressDisplay();
        }
    }

    async saveLightningAddress(address) {
        if (address) {
            this.lightningAddress = address;
            // Save with pubkey-specific key
            localStorage.setItem(`nym_lightning_address_${this.pubkey}`, address);

            // Always save to Nostr profile (not just for extension users)
            await this.saveToNostrProfile();
        } else {
            this.lightningAddress = null;
            localStorage.removeItem(`nym_lightning_address_${this.pubkey}`);
        }

        this.updateLightningAddressDisplay();
    }

    updateLightningAddressDisplay() {
        const display = document.getElementById('lightningAddressDisplay');
        const value = document.getElementById('lightningAddressValue');

        if (this.lightningAddress && display && value) {
            display.style.display = 'flex';
            value.textContent = this.lightningAddress;
        } else if (display) {
            display.style.display = 'none';
        }
    }

    async saveToNostrProfile() {
        if (!this.pubkey) return;

        try {
            let profileToSave;

            // For persistent connections, preserve existing profile data
            if (this.connectionMode !== 'ephemeral') {
                // Fetch current profile if we don't have it
                if (!this.originalProfile) {
                    await this.fetchProfileFromRelay(this.pubkey);
                }

                // Start with existing profile or empty object
                profileToSave = { ...(this.originalProfile || {}) };

                // Update only the fields we manage
                profileToSave.name = this.nym;
                profileToSave.display_name = this.nym;

                // Update lightning address if we have one, otherwise preserve existing
                if (this.lightningAddress) {
                    profileToSave.lud16 = this.lightningAddress;
                } else if (!profileToSave.lud16) {
                    // Only remove if there wasn't one before
                    delete profileToSave.lud16;
                }

            } else {
                // Ephemeral mode - minimal profile
                profileToSave = {
                    name: this.nym,
                    display_name: this.nym,
                    lud16: this.lightningAddress,
                    about: `NYM user - ${this.nym}`
                };
            }

            const profileEvent = {
                kind: 0,
                created_at: Math.floor(Date.now() / 1000),
                tags: [],
                content: JSON.stringify(profileToSave),
                pubkey: this.pubkey
            };

            // Sign based on connection mode
            let signedEvent;
            if (this.connectionMode === 'extension' && window.nostr) {
                signedEvent = await window.nostr.signEvent(profileEvent);
            } else if (this.privkey) {
                signedEvent = NostrTools.finalizeEvent(profileEvent, this.privkey);
            }

            if (signedEvent) {
                this.sendToRelay(["EVENT", signedEvent]);
                console.log('Profile saved to Nostr, preserved fields:', Object.keys(profileToSave));
            }
        } catch (error) {
            console.error('Failed to save profile:', error);
        }
    }

    async fetchLightningAddressFromProfile(pubkey) {
        // Create a request for the user's profile
        const subscription = [
            "REQ",
            "profile-ln-" + Math.random().toString(36).substring(2),
            {
                kinds: [0],
                authors: [pubkey],
                limit: 1
            }
        ];

        // Send request
        this.sendToRelay(subscription);

        // Set timeout to close subscription
        setTimeout(() => {
            this.sendToRelay(["CLOSE", subscription[1]]);
        }, 3000);
    }

    // Show zap modal
    showZapModal(messageId, recipientPubkey, recipientNym) {
        // Check if recipient has lightning address
        const lnAddress = this.userLightningAddresses.get(recipientPubkey);

        if (!lnAddress) {
            this.displaySystemMessage(`${recipientNym} doesn't have a lightning address set`);
            return;
        }

        // Store target info
        this.currentZapTarget = {
            messageId,
            recipientPubkey,
            recipientNym,
            lnAddress
        };

        // Reset modal state
        document.getElementById('zapAmountSection').style.display = 'block';
        document.getElementById('zapInvoiceSection').style.display = 'none';
        document.getElementById('zapRecipientInfo').textContent = `Zapping @${recipientNym}`;
        document.getElementById('zapCustomAmount').value = '';
        document.getElementById('zapComment').value = '';
        document.getElementById('zapSendBtn').textContent = 'Generate Invoice';
        document.getElementById('zapSendBtn').onclick = () => this.generateZapInvoice();

        // Clear selected amounts
        document.querySelectorAll('.zap-amount-btn').forEach(btn => {
            btn.classList.remove('selected');
            btn.onclick = (e) => {
                document.querySelectorAll('.zap-amount-btn').forEach(b => b.classList.remove('selected'));
                e.target.closest('.zap-amount-btn').classList.add('selected');
                document.getElementById('zapCustomAmount').value = '';
            };
        });

        // Show modal
        document.getElementById('zapModal').classList.add('active');
    }

    showProfileZapModal(recipientPubkey, recipientNym, lnAddress) {
        // Store target info for profile zap (no messageId)
        this.currentZapTarget = {
            messageId: null, // No message ID for profile zaps
            recipientPubkey,
            recipientNym,
            lnAddress,
            isProfileZap: true
        };

        // Reset modal state
        document.getElementById('zapAmountSection').style.display = 'block';
        document.getElementById('zapInvoiceSection').style.display = 'none';
        document.getElementById('zapRecipientInfo').textContent = `Zapping @${recipientNym}'s profile`;
        document.getElementById('zapCustomAmount').value = '';
        document.getElementById('zapComment').value = '';
        document.getElementById('zapSendBtn').textContent = 'Generate Invoice';
        document.getElementById('zapSendBtn').onclick = () => this.generateZapInvoice();

        // Clear selected amounts
        document.querySelectorAll('.zap-amount-btn').forEach(btn => {
            btn.classList.remove('selected');
            btn.onclick = (e) => {
                document.querySelectorAll('.zap-amount-btn').forEach(b => b.classList.remove('selected'));
                e.target.closest('.zap-amount-btn').classList.add('selected');
                document.getElementById('zapCustomAmount').value = '';
            };
        });

        // Show modal
        document.getElementById('zapModal').classList.add('active');
    }

    cleanupOldLightningAddress() {
        // Remove old non-pubkey-specific entry if it exists
        const oldAddress = localStorage.getItem('nym_lightning_address');
        if (oldAddress) {
            localStorage.removeItem('nym_lightning_address');
            console.log('Cleaned up old lightning address format');
        }
    }

    // Create zap request event (NIP-57)
    async createZapRequest(amountSats, comment) {
        try {
            if (!this.currentZapTarget) {
                console.error('No target for zap request');
                return null;
            }

            const zapRequest = {
                kind: 9734,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['p', this.currentZapTarget.recipientPubkey], // Recipient of zap
                    ['amount', (parseInt(amountSats) * 1000).toString()], // Amount in millisats
                    ['relays', ...this.broadcastRelays.slice(0, 5)] // Limit to 5 relays
                ],
                content: comment || '',
                pubkey: this.pubkey
            };

            // Add event tag only if this is a message zap (not profile zap)
            if (this.currentZapTarget.messageId) {
                zapRequest.tags.unshift(['e', this.currentZapTarget.messageId]); // Event being zapped
            }

            // Sign the request
            let signedEvent;
            if (window.nostr && !this.privkey) {
                signedEvent = await window.nostr.signEvent(zapRequest);
            } else if (this.privkey) {
                signedEvent = NostrTools.finalizeEvent(zapRequest, this.privkey);
            }

            return signedEvent;
        } catch (error) {
            console.error('Failed to create zap request:', error);
            return null;
        }
    }

    // Generate and display invoice
    async generateZapInvoice() {
        if (!this.currentZapTarget) return;

        // Get amount
        const selectedBtn = document.querySelector('.zap-amount-btn.selected');
        const customAmount = document.getElementById('zapCustomAmount').value;
        const amount = customAmount || (selectedBtn ? selectedBtn.dataset.amount : null);

        if (!amount || amount <= 0) {
            this.displaySystemMessage('Please select or enter an amount');
            return;
        }

        const comment = document.getElementById('zapComment').value || '';

        // Show loading state
        document.getElementById('zapAmountSection').style.display = 'none';
        document.getElementById('zapInvoiceSection').style.display = 'block';
        document.getElementById('zapStatus').className = 'zap-status checking';
        document.getElementById('zapStatus').innerHTML = '<span class="loader"></span> Generating invoice...';

        try {
            // Fetch the invoice
            const invoice = await this.fetchLightningInvoice(
                this.currentZapTarget.lnAddress,
                amount,
                comment
            );

            if (invoice) {
                this.currentZapInvoice = invoice;
                this.zapInvoiceData = {
                    ...invoice,
                    messageId: this.currentZapTarget.messageId,
                    recipientPubkey: this.currentZapTarget.recipientPubkey
                };

                // Display invoice
                this.displayZapInvoice(invoice);

                // Start checking for payment
                this.checkZapPayment(invoice);
            }
        } catch (error) {
            console.error('Failed to generate invoice:', error);
            document.getElementById('zapStatus').className = 'zap-status';
            document.getElementById('zapStatus').innerHTML = `Failed: ${error.message}`;
        }
    }

    // Display the invoice with QR code
    displayZapInvoice(invoice) {
        document.getElementById('zapStatus').style.display = 'none';
        document.getElementById('zapInvoiceDisplay').style.display = 'block';

        // Display invoice text
        const invoiceEl = document.getElementById('zapInvoice');
        invoiceEl.textContent = invoice.pr;

        // Generate QR code
        const qrContainer = document.getElementById('zapQRCode');
        qrContainer.innerHTML = ''; // Clear existing QR

        // Set container to center content
        qrContainer.style.cssText = 'text-align: center; display: flex; justify-content: center; align-items: center;';

        // Create QR code element with white border styling
        const qrDiv = document.createElement('div');
        qrDiv.id = 'zapQRCodeCanvas';
        qrDiv.style.cssText = 'display: inline-block; padding: 15px; background: white; border: 5px solid white; border-radius: 10px;';
        qrContainer.appendChild(qrDiv);

        // Generate QR using the invoice
        try {
            // Just the raw invoice, no lightning: prefix
            QRCode.toCanvas(qrDiv, invoice.pr, {
                width: 200,
                height: 200,
                color: {
                    dark: "#000000",
                    light: "#ffffff",
                },
                errorCorrectionLevel: 'L'
            });

            console.log('Generated QR code for invoice:', invoice.pr.substring(0, 50) + '...');
        } catch (err) {
            console.error('QRCode generation failed:', err);
            // Fallback if QRCode library not loaded
            qrContainer.innerHTML = `
    <div style="display: inline-block; padding: 20px; border: 5px solid white; background: white; color: black; text-align: center; border-radius: 10px;">
        <div style="font-size: 14px; margin-bottom: 10px;">Lightning Invoice</div>
        <div style="font-size: 10px; word-break: break-all;">${invoice.pr.substring(0, 60)}...</div>
        <div style="margin-top: 10px; font-size: 12px; color: red;">QR generation failed - copy invoice manually</div>
    </div>
`;
        }

        // Update button
        document.getElementById('zapSendBtn').textContent = 'Close';
        document.getElementById('zapSendBtn').onclick = () => this.closeZapModal();
    }

    // Check if payment was made
    async checkZapPayment(invoice) {
        if (!invoice.verify) {
            // No verify URL, just wait for zap receipt event
            this.listenForZapReceipt();
            return;
        }

        let checkCount = 0;
        const maxChecks = 60; // Check for up to 60 seconds

        this.zapCheckInterval = setInterval(async () => {
            checkCount++;

            try {
                const response = await fetch(invoice.verify);
                const data = await response.json();

                if (data.settled || data.paid) {
                    // Payment confirmed!
                    clearInterval(this.zapCheckInterval);
                    this.handleZapPaymentSuccess(invoice.amount);
                } else if (checkCount >= maxChecks) {
                    // Timeout
                    clearInterval(this.zapCheckInterval);
                    document.getElementById('zapStatus').style.display = 'block';
                    document.getElementById('zapStatus').className = 'zap-status';
                    document.getElementById('zapStatus').innerHTML = 'Payment timeout - please check your wallet';
                }
            } catch (error) {
                console.error('Error checking payment:', error);
            }
        }, 1000); // Check every second
    }

    // Listen for zap receipt events
    listenForZapReceipt() {
        // Subscribe to zap receipt events (kind 9735) for this specific event
        const subscription = [
            "REQ",
            "zap-receipt-" + Math.random().toString(36).substring(2),
            {
                kinds: [9735],
                "#e": [this.currentZapTarget.messageId],
                since: Math.floor(Date.now() / 1000) - 300, // Last 5 minutes
                limit: 10
            }
        ];

        this.sendToRelay(subscription);

        // Also close the subscription after 60 seconds
        setTimeout(() => {
            this.sendToRelay(["CLOSE", subscription[1]]);
        }, 60000);
    }

    // Handle successful payment
    handleZapPaymentSuccess(amount) {
        if (!this.currentZapTarget) return;

        // Clear check interval
        if (this.zapCheckInterval) {
            clearInterval(this.zapCheckInterval);
            this.zapCheckInterval = null;
        }

        // Update UI
        document.getElementById('zapInvoiceDisplay').style.display = 'none';
        document.getElementById('zapStatus').style.display = 'block';
        document.getElementById('zapStatus').className = 'zap-status paid';
        document.getElementById('zapStatus').innerHTML = `
<div style="font-size: 24px; margin-bottom: 10px;">⚡</div>
<div>Zap sent successfully!</div>
<div style="font-size: 20px; margin-top: 10px;">${amount} sats</div>
`;

        // Close modal after 2 seconds
        setTimeout(() => {
            this.closeZapModal();
        }, 2000);
    }

    // Handle zap receipt events (NIP-57)
    handleZapReceipt(event) {
        if (event.kind !== 9735) return;

        // Parse zap receipt
        const eTag = event.tags.find(t => t[0] === 'e');
        const pTag = event.tags.find(t => t[0] === 'p');
        const boltTag = event.tags.find(t => t[0] === 'bolt11');
        const descriptionTag = event.tags.find(t => t[0] === 'description');

        if (!eTag || !boltTag) return;

        const messageId = eTag[1];
        const bolt11 = boltTag[1];

        // Parse amount from bolt11
        const amount = this.parseAmountFromBolt11(bolt11);

        if (amount) {
            // Get zapper pubkey from description if available
            let zapperPubkey = event.pubkey; // This is usually the zap service pubkey

            if (descriptionTag) {
                try {
                    const zapRequest = JSON.parse(descriptionTag[1]);
                    if (zapRequest.pubkey) {
                        zapperPubkey = zapRequest.pubkey; // This is the actual zapper
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }

            // Initialize zaps tracking for this message if needed
            if (!this.zaps.has(messageId)) {
                this.zaps.set(messageId, {
                    receipts: new Set(), // Track receipt IDs to prevent duplicates
                    amounts: new Map()   // Map of pubkey -> total amount
                });
            }

            const messageZaps = this.zaps.get(messageId);

            // Check if we've already processed this receipt (deduplication)
            if (messageZaps.receipts.has(event.id)) {
                return; // Already processed this zap receipt
            }

            // Mark this receipt as processed
            messageZaps.receipts.add(event.id);

            // Update the amount for this zapper
            const currentAmount = messageZaps.amounts.get(zapperPubkey) || 0;
            messageZaps.amounts.set(zapperPubkey, currentAmount + amount);

            // Update display for this message
            this.updateMessageZaps(messageId);

            // Check if this is for our current pending zap
            if (this.currentZapTarget &&
                this.currentZapTarget.messageId === messageId &&
                zapperPubkey === this.pubkey) {
                this.handleZapPaymentSuccess(amount);
            }
        }
    }

    // Parse amount from bolt11 invoice (simplified)
    parseAmountFromBolt11(bolt11) {
        const match = bolt11.match(/lnbc(\d+)([munp])/i);
        if (match) {
            const amount = parseInt(match[1]);
            const multiplier = match[2];

            switch (multiplier) {
                case 'm': return amount * 100000; // millisats to sats
                case 'u': return amount * 100; // microsats to sats
                case 'n': return Math.round(amount / 10); // nanosats to sats
                case 'p': return Math.round(amount / 10000); // picosats to sats
                default: return amount;
            }
        }
        return null;
    }

    // Update message with zap display
    updateMessageZaps(messageId) {
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageEl) return;

        const messageZaps = this.zaps.get(messageId);

        // Find or create reactions row
        let reactionsRow = messageEl.querySelector('.reactions-row');
        if (!reactionsRow) {
            reactionsRow = document.createElement('div');
            reactionsRow.className = 'reactions-row';
            messageEl.appendChild(reactionsRow);
        }

        // Remove existing zap badges
        const existingZap = reactionsRow.querySelector('.zap-badge');
        if (existingZap) {
            existingZap.remove();
        }
        const existingZapBtn = reactionsRow.querySelector('.add-zap-btn');
        if (existingZapBtn) {
            existingZapBtn.remove();
        }

        // Only add badges if there are zaps
        if (messageZaps && messageZaps.amounts.size > 0) {
            // Calculate total zaps from the amounts map
            let totalZaps = 0;
            messageZaps.amounts.forEach(amount => {
                totalZaps += amount;
            });

            const zapBadge = document.createElement('span');
            zapBadge.className = 'zap-badge';
            zapBadge.innerHTML = `
    <svg class="zap-icon" viewBox="0 0 24 24">
        <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>
    </svg>
    ${totalZaps}
`;

            const zapperCount = messageZaps.amounts.size;
            zapBadge.title = `${zapperCount} zapper${zapperCount > 1 ? 's' : ''} • ${totalZaps} sats total`;

            // Insert at beginning of reactions row
            reactionsRow.insertBefore(zapBadge, reactionsRow.firstChild);

            // Add quick zap button ONLY if zaps exist and not own message
            const pubkey = messageEl.dataset.pubkey;
            if (pubkey && pubkey !== this.pubkey) {
                const addZapBtn = document.createElement('span');
                addZapBtn.className = 'add-zap-btn';
                addZapBtn.innerHTML = `
        <svg viewBox="0 0 24 24">
            <path d="M11 2L1 14h8l-1 8 10-12h-8l1-8z" stroke="var(--text)" fill="var(--text)"/>
            <circle cx="19" cy="6" r="5" fill="var(--text)" stroke="none"></circle>
            <line x1="19" y1="4" x2="19" y2="8" stroke="var(--bg)" stroke-width="1.5" stroke-linecap="round"></line>
            <line x1="17" y1="6" x2="21" y2="6" stroke="var(--bg)" stroke-width="1.5" stroke-linecap="round"></line>
        </svg>
    `;
                addZapBtn.title = 'Quick zap';
                addZapBtn.onclick = async (e) => {
                    e.stopPropagation();
                    await this.handleQuickZap(messageId, pubkey, messageEl);
                };

                // Insert after zap badge
                reactionsRow.insertBefore(addZapBtn, zapBadge.nextSibling);
            }
        }
    }

    async handleQuickZap(messageId, pubkey, messageEl) {
        // Get the author's nym
        const author = messageEl.dataset.author;

        // Show loading message
        this.displaySystemMessage(`Checking if @${author} can receive zaps...`);

        try {
            // Always fetch fresh to ensure we have the latest
            const lnAddress = await this.fetchLightningAddressForUser(pubkey);

            if (lnAddress) {
                // User has lightning address, show zap modal
                this.showZapModal(messageId, pubkey, author);
            } else {
                // No lightning address found
                this.displaySystemMessage(`@${author} cannot receive zaps (no lightning address set)`);
            }
        } catch (error) {
            console.error('Error fetching lightning address:', error);
            this.displaySystemMessage(`Failed to check if @${author} can receive zaps`);
        }
    }

    // Close zap modal
    closeZapModal() {
        const modal = document.getElementById('zapModal');
        modal.classList.remove('active');

        // Clear interval if running
        if (this.zapCheckInterval) {
            clearInterval(this.zapCheckInterval);
            this.zapCheckInterval = null;
        }

        // Reset state
        this.currentZapTarget = null;
        this.currentZapInvoice = null;
        this.zapInvoiceData = null;
    }

    // Copy invoice to clipboard
    copyZapInvoice() {
        if (!this.currentZapInvoice) return;

        navigator.clipboard.writeText(this.currentZapInvoice.pr).then(() => {
            // Show feedback
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy:', err);
            this.displaySystemMessage('Failed to copy invoice');
        });
    }

    // Open invoice in wallet
    openInWallet() {
        if (!this.currentZapInvoice) return;

        // Try multiple methods to open wallet
        const invoice = this.currentZapInvoice.pr;

        // Check if invoice already has lightning: prefix
        const invoiceToOpen = invoice.toLowerCase().startsWith('lightning:') ?
            invoice : `lightning:${invoice}`;

        // Try opening with lightning: URI scheme
        window.open(invoiceToOpen, '_blank');

        // Also copy to clipboard as fallback (just the raw invoice)
        navigator.clipboard.writeText(invoice).then(() => {
            this.displaySystemMessage('Invoice copied - paste in your wallet');
        }).catch(err => {
            console.error('Failed to copy:', err);
            this.displaySystemMessage('Failed to copy invoice');
        });
    }

    // Discovering relays via NIP-66
    async discoverRelays() {
        try {
            // Check if we need to refresh the relay list
            const now = Date.now();
            if (now - this.lastRelayDiscovery < this.relayDiscoveryInterval && this.discoveredRelays.size > 0) {
                console.log('Using cached relay list');
                return;
            }

            // Try to load from cache first
            this.loadCachedRelays();

            // Connect to monitor relays to get relay list
            for (const monitorRelay of this.monitorRelays) {
                try {
                    await this.fetchRelaysFromMonitor(monitorRelay);
                } catch (error) {
                    console.error(`Failed to fetch from monitor ${monitorRelay}:`, error);
                }
            }

            // Save discovered relays to cache
            this.saveCachedRelays();

            this.lastRelayDiscovery = now;

        } catch (error) {
            console.error('Failed to discover relays:', error);
            // Fall back to broadcast relays if discovery fails
            if (this.discoveredRelays.size === 0) {
                this.broadcastRelays.forEach(relay => this.discoveredRelays.add(relay));
            }
        }
    }

    async fetchRelaysFromMonitor(monitorUrl) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(monitorUrl);
            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error('Timeout fetching relay list'));
            }, 10000);

            ws.onopen = () => {
                // Request relay metadata events (NIP-66 kind 30066)
                const subscription = [
                    "REQ",
                    "relay-list-" + Math.random().toString(36).substring(2),
                    {
                        kinds: [30066], // NIP-66 relay metadata
                        limit: 1000
                    }
                ];
                ws.send(JSON.stringify(subscription));
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (Array.isArray(msg) && msg[0] === 'EVENT') {
                        const relayEvent = msg[2];
                        if (relayEvent && relayEvent.kind === 30066) {
                            this.parseRelayMetadata(relayEvent);
                        }
                    } else if (Array.isArray(msg) && msg[0] === 'EOSE') {
                        clearTimeout(timeout);
                        ws.close();
                        resolve();
                    }
                } catch (e) {
                    console.error('Failed to parse monitor message:', e);
                }
            };

            ws.onerror = (error) => {
                clearTimeout(timeout);
                reject(error);
            };
        });
    }

    parseRelayMetadata(event) {
        try {
            // Extract relay URL from d tag
            const dTag = event.tags.find(t => t[0] === 'd');
            if (!dTag || !dTag[1]) return;

            const relayUrl = dTag[1];

            // Check if relay supports required NIPs
            const nTags = event.tags.filter(t => t[0] === 'n');
            const supportsRequired = nTags.some(t => t[1] === '1') || nTags.length === 0; // Basic protocol support

            if (supportsRequired && relayUrl.startsWith('wss://')) {
                this.discoveredRelays.add(relayUrl);
            }
        } catch (error) {
            console.error('Failed to parse relay metadata:', error);
        }
    }

    loadCachedRelays() {
        try {
            const cached = localStorage.getItem('nym_discovered_relays');
            if (cached) {
                const data = JSON.parse(cached);
                if (data.timestamp && Date.now() - data.timestamp < this.relayDiscoveryInterval) {
                    data.relays.forEach(relay => this.discoveredRelays.add(relay));
                    console.log(`Loaded ${data.relays.length} cached relays`);
                }
            }
        } catch (error) {
            console.error('Failed to load cached relays:', error);
        }
    }

    saveCachedRelays() {
        try {
            const data = {
                timestamp: Date.now(),
                relays: Array.from(this.discoveredRelays)
            };
            localStorage.setItem('nym_discovered_relays', JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save cached relays:', error);
        }
    }

    subscribeToMessages() {
        // Subscribe to both ephemeral and channel messages
        const subscription = [
            "REQ",
            "msgs-" + Math.random().toString(36).substring(2),
            {
                kinds: [20000, 23333], // Geohash and standard channels
                limit: 200
            }
        ];

        this.sendToRelay(subscription);
    }

    subscribeToReactions() {
        // Subscribe to reactions (NIP-25) with filters for our specific kinds
        const subscription = [
            "REQ",
            "reactions-" + Math.random().toString(36).substring(2),
            {
                kinds: [7], // Reaction events
                "#k": ["20000", "23333", "4"], // Only reactions to our supported kinds
                limit: 1000,
                since: Math.floor(Date.now() / 1000) - 7200 // Last 2 hours
            }
        ];

        this.sendToRelay(subscription);

        // Subscribe to zap receipts for ALL messages we might care about
        const zapSubscription = [
            "REQ",
            "zaps-" + Math.random().toString(36).substring(2),
            {
                kinds: [9735], // Zap receipt events
                limit: 1000,
                since: Math.floor(Date.now() / 1000) - 86400 // Last 24 hours
            }
        ];

        this.sendToRelay(zapSubscription);

        // Also subscribe to zap receipts specifically for messages in current view
        const currentChannelKey = this.currentGeohash ? `#${this.currentGeohash}` : this.currentChannel;
        const channelMessages = this.messages.get(currentChannelKey) || [];

        if (channelMessages.length > 0) {
            const messageIds = channelMessages.map(m => m.id).filter(id => id);
            if (messageIds.length > 0) {
                const channelZapSubscription = [
                    "REQ",
                    "channel-zaps-" + Math.random().toString(36).substring(2),
                    {
                        kinds: [9735],
                        "#e": messageIds.slice(0, 100), // Limit to 100 most recent messages
                        since: Math.floor(Date.now() / 1000) - 86400
                    }
                ];
                this.sendToRelay(channelZapSubscription);
            }
        }
    }

    subscribeToPMs() {
        if (!this.pubkey) return;

        // Only subscribe to legacy NIP-04 support for compatibility
        const legacySubscription = [
            "REQ",
            "pms-legacy-" + Math.random().toString(36).substring(2),
            {
                kinds: [4], // NIP-04 encrypted direct messages
                "#p": [this.pubkey],
                limit: 50
            }
        ];

        this.sendToRelay(legacySubscription);
    }

    async loadSyncedSettings() {
        if (!this.pubkey || this.connectionMode === 'ephemeral') return;

        // Request NIP-78 settings (kind 30078)
        const subscription = [
            "REQ",
            "settings-" + Math.random().toString(36).substring(2),
            {
                kinds: [30078],
                authors: [this.pubkey],
                "#d": ["nym-settings"],
                limit: 1
            }
        ];

        this.sendToRelay(subscription);

        // Close subscription after timeout
        setTimeout(() => {
            this.sendToRelay(["CLOSE", subscription[1]]);
        }, 3000);
    }

    async saveSyncedSettings() {
        if (!this.pubkey) return;

        try {
            const settingsData = {
                theme: this.settings.theme,
                sound: this.settings.sound,
                autoscroll: this.settings.autoscroll,
                showTimestamps: this.settings.showTimestamps,
                sortByProximity: this.settings.sortByProximity,
                pinnedChannels: Array.from(this.pinnedChannels),
                blockedUsers: Array.from(this.blockedUsers),
                blockedKeywords: Array.from(this.blockedKeywords),
                blockedChannels: Array.from(this.blockedChannels),
                userJoinedChannels: Array.from(this.userJoinedChannels),
                lightningAddress: this.lightningAddress
            };

            const event = {
                kind: 30078,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ["d", "nym-settings"],
                    ["title", "NYM Settings"],
                    ["encrypted"]
                ],
                content: JSON.stringify(settingsData),
                pubkey: this.pubkey
            };

            // Sign event
            let signedEvent;
            if (this.connectionMode === 'extension' && window.nostr) {
                signedEvent = await window.nostr.signEvent(event);
            } else if ((this.connectionMode === 'nsec' || this.connectionMode === 'ephemeral') && this.privkey) {
                signedEvent = NostrTools.finalizeEvent(event, this.privkey);
            } else {
                console.log('Cannot sign settings - no signing method available');
                return;
            }

            if (signedEvent) {
                this.sendToRelay(["EVENT", signedEvent]);
                console.log('Settings synced to Nostr including:', Object.keys(settingsData));
            }
        } catch (error) {
            console.error('Failed to save synced settings:', error);
        }
    }

    discoverChannels() {
        // Create a mixed array of all channels
        const allChannels = [];

        // Add all standard channels
        this.commonChannels.forEach(channel => {
            // Don't re-add if already exists or if user-joined
            if (!this.channels.has(channel) && !this.userJoinedChannels.has(channel)) {
                allChannels.push({
                    name: channel,
                    geohash: '',
                    type: 'standard',
                    sortKey: Math.random()
                });
            }
        });

        // Add all geohash channels
        this.commonGeohashes.forEach(geohash => {
            // Don't re-add if already exists or if user-joined
            if (!this.channels.has(geohash) && !this.userJoinedChannels.has(geohash)) {
                allChannels.push({
                    name: geohash,
                    geohash: geohash,
                    type: 'geo',
                    sortKey: Math.random()
                });
            }
        });

        // Sort randomly to mix standard and geo channels
        allChannels.sort((a, b) => a.sortKey - b.sortKey);

        // Add channels to UI in mixed order
        allChannels.forEach(channel => {
            this.addChannel(channel.name, channel.geohash);
        });
    }

    async discoverExistingChannels() {
        // Subscribe to recent channel creation/message events to discover channels
        const discoverySubscription = [
            "REQ",
            "channel-discovery-" + Math.random().toString(36).substring(2),
            {
                kinds: [23333, 20000], // Both standard and geohash channels
                limit: 500, // Get more events to discover more channels
                since: Math.floor(Date.now() / 1000) - 86400 // Last 24 hours
            }
        ];

        this.sendToRelay(discoverySubscription);
    }


    sendToRelay(message) {
        const msg = JSON.stringify(message);

        if (Array.isArray(message) && message[0] === 'EVENT') {
            // For EVENT messages, send to broadcast relays and nosflare
            this.broadcastEvent(message);
        } else if (Array.isArray(message) && message[0] === 'REQ') {
            // For REQ messages, send to all connected read relays
            this.sendRequestToAllRelays(message);
        } else {
            // For other messages (CLOSE, etc.), send to all relays
            this.relayPool.forEach((relay, url) => {
                if (relay.ws && relay.ws.readyState === WebSocket.OPEN) {
                    relay.ws.send(msg);
                }
            });
        }
    }

    broadcastEvent(message) {
        const msg = JSON.stringify(message);

        // Send to broadcast relays
        this.broadcastRelays.forEach(relayUrl => {
            const relay = this.relayPool.get(relayUrl);
            if (relay && relay.ws && relay.ws.readyState === WebSocket.OPEN) {
                relay.ws.send(msg);
            }
        });

        // Also send to nosflare
        const nosflare = this.relayPool.get(this.nosflareRelay);
        if (nosflare && nosflare.ws && nosflare.ws.readyState === WebSocket.OPEN) {
            nosflare.ws.send(msg);
        }
    }

    sendRequestToAllRelays(message) {
        const msg = JSON.stringify(message);

        // Send REQ to all connected relays EXCEPT nosflare
        this.relayPool.forEach((relay, url) => {
            if (relay.ws && relay.ws.readyState === WebSocket.OPEN && relay.type !== 'nosflare') {
                relay.ws.send(msg);
            }
        });
    }

    subscribeToAllRelays() {
        // Get all relays except nosflare
        const readableRelays = Array.from(this.relayPool.entries())
            .filter(([url, relay]) => relay.type !== 'nosflare' && relay.ws && relay.ws.readyState === WebSocket.OPEN);

        if (readableRelays.length === 0) {
            console.log('No readable relays connected yet');
            return;
        }

        // Send subscriptions to each readable relay
        readableRelays.forEach(([url, relay]) => {
            this.subscribeToSingleRelay(url);
        });

        // Also do channel discovery
        this.discoverChannels();
        this.discoverExistingChannels();
    }

    handleRelayMessage(msg, relayUrl) {
        if (!Array.isArray(msg)) return;

        const [type, ...data] = msg;

        switch (type) {
            case 'EVENT':
                const [subscriptionId, event] = data;

                // Track what kinds this relay is sending us
                if (event && event.kind && this.relayKinds.has(relayUrl)) {
                    const relayKindTracker = this.relayKinds.get(relayUrl);

                    // For reactions (kind 7), only count them if they have the right k tags
                    if (event.kind === 7) {
                        const kTag = event.tags?.find(t => t[0] === 'k');
                        if (kTag && ['20000', '23333', '4'].includes(kTag[1])) {
                            relayKindTracker.add(7); // Only add if it's a reaction for our kinds
                        }
                    } else {
                        // For other kinds, add them directly
                        relayKindTracker.add(event.kind);
                    }
                }

                // Handle profile events (kind 0) for lightning addresses
                if (event && event.kind === 0) {
                    try {
                        const profile = JSON.parse(event.content);
                        const pubkey = event.pubkey;

                        // Store lightning address if present
                        if (profile.lud16 || profile.lud06) {
                            const lnAddress = profile.lud16 || profile.lud06;
                            this.userLightningAddresses.set(pubkey, lnAddress);
                            console.log(`Got lightning address for ${pubkey}:`, lnAddress);
                        }

                        // Update nym if we don't have one for this user
                        if (profile.name || profile.username || profile.display_name) {
                            const profileName = profile.name || profile.username || profile.display_name;
                            if (!this.users.has(pubkey) || this.users.get(pubkey).nym.startsWith('anon-')) {
                                this.users.set(pubkey, {
                                    nym: profileName.substring(0, 20),
                                    pubkey: pubkey,
                                    lastSeen: Date.now(),
                                    status: 'online',
                                    channels: new Set()
                                });
                            }
                        }
                    } catch (e) {
                        // Ignore profile parse errors
                    }
                }

                // Deduplicate events by ID
                if (event && event.id) {
                    if (this.eventDeduplication.has(event.id)) {
                        // We've already processed this event
                        return;
                    }

                    // Mark event as seen
                    this.eventDeduplication.set(event.id, true);

                    // Clean up old events periodically (keep last 10000)
                    if (this.eventDeduplication.size > 10000) {
                        const entriesToDelete = this.eventDeduplication.size - 10000;
                        let deleted = 0;
                        for (const key of this.eventDeduplication.keys()) {
                            if (deleted >= entriesToDelete) break;
                            this.eventDeduplication.delete(key);
                            deleted++;
                        }
                    }
                }

                this.handleEvent(event);
                break;
            case 'OK':
                // Event was accepted
                break;
            case 'EOSE':
                // End of stored events
                break;
            case 'NOTICE':
                const notice = data[0];
                console.log(`Notice from ${relayUrl}: ${notice}`);
                break;
        }
    }

    cleanupNonResponsiveRelays() {
        const now = Date.now();

        this.relayPool.forEach((relay, url) => {
            if (relay.type === 'read') {
                const kinds = this.relayKinds.get(url);

                // Check if relay has sent any of our required kinds
                if (kinds && kinds.size > 0) {
                    const hasRequiredKinds =
                        kinds.has(20000) || // geohash channels
                        kinds.has(23333) || // standard channels  
                        kinds.has(7) ||     // reactions (already filtered for our k tags)
                        kinds.has(4);       // PMs

                    if (!hasRequiredKinds) {
                        console.log(`Relay ${url} doesn't support our required kinds, disconnecting`);
                        relay.ws.close();
                        this.relayPool.delete(url);
                        this.relayKinds.delete(url);
                        this.blacklistedRelays.add(url);
                        this.updateConnectionStatus();
                    }
                } else if (now - relay.connectedAt > this.relayVerificationTimeout) {
                    // No kinds received within timeout
                    console.log(`Relay ${url} hasn't sent any events within timeout, disconnecting`);
                    relay.ws.close();
                    this.relayPool.delete(url);
                    this.relayKinds.delete(url);
                    this.blacklistedRelays.add(url);
                    this.updateConnectionStatus();
                }
            }
        });
    }

    async handleEvent(event) {
        const messageAge = Date.now() - (event.created_at * 1000);
        const isHistorical = messageAge > 10000; // Older than 10 seconds

        if (event.kind === 20000) {
            // Handle geohash channel messages
            const nymTag = event.tags.find(t => t[0] === 'n');
            const geohashTag = event.tags.find(t => t[0] === 'g');

            const nym = nymTag ? nymTag[1] : this.getNymFromPubkey(event.pubkey);
            const geohash = geohashTag ? geohashTag[1] : '';

            // Check if user is blocked or message contains blocked keywords
            if (this.blockedUsers.has(nym) || this.hasBlockedKeyword(event.content)) {
                return;
            }

            if (this.isSpamMessage(event.content)) {
                console.log('Blocked spam message from', nym);
                return;
            }

            // Check flooding FOR THIS CHANNEL (only for non-historical messages)
            if (!isHistorical && this.isFlooding(event.pubkey, geohash)) {
                return;
            }

            // Only track flood for new messages in this channel
            if (!isHistorical) {
                this.trackMessage(event.pubkey, geohash, isHistorical);
            }

            // Check for BRB auto-response (UNIVERSAL) - only for NEW messages
            if (!isHistorical && this.isMentioned(event.content) && this.awayMessages.has(this.pubkey)) {
                // Check if we haven't already responded to this user in this session
                const responseKey = `brb_universal_${this.pubkey}_${nym}`;
                if (!sessionStorage.getItem(responseKey)) {
                    sessionStorage.setItem(responseKey, '1');

                    // Send auto-response to the same channel where mentioned
                    const response = `@${nym} [Auto-Reply] ${this.awayMessages.get(this.pubkey)}`;
                    await this.publishMessage(response, geohash, geohash);
                }
            }

            // Add channel if it's new (and not blocked)
            if (geohash && !this.channels.has(geohash) && !this.isChannelBlocked(geohash, geohash)) {
                this.addChannelToList(geohash, geohash);
            }

            const message = {
                id: event.id,
                author: nym,
                pubkey: event.pubkey,
                content: event.content,
                timestamp: new Date(event.created_at * 1000),
                channel: geohash ? geohash : 'unknown',
                geohash: geohash,
                isOwn: event.pubkey === this.pubkey,
                isHistorical: isHistorical
            };

            // Don't display duplicate of own messages
            if (!this.isDuplicateMessage(message)) {
                this.displayMessage(message);
                this.updateUserPresence(nym, event.pubkey, message.channel, geohash);

                // Show notification only if mentioned and not blocked
                if (!message.isOwn && document.hidden && this.isMentioned(message.content) && !this.blockedUsers.has(nym)) {
                    this.showNotification(nym, message.content);
                }
            }
        } else if (event.kind === 23333) {
            // Handle standard channel messages
            const nymTag = event.tags.find(t => t[0] === 'n');
            const channelTag = event.tags.find(t => t[0] === 'd');

            const nym = nymTag ? nymTag[1] : this.getNymFromPubkey(event.pubkey);
            const channel = channelTag ? channelTag[1] : 'bar';

            // Check if user is blocked or message contains blocked keywords
            if (this.blockedUsers.has(nym) || this.hasBlockedKeyword(event.content)) {
                return;
            }

            if (this.isSpamMessage(event.content)) {
                console.log('Blocked spam message from', nym);
                return;
            }

            // Check flooding FOR THIS CHANNEL (only for non-historical messages)
            if (!isHistorical && this.isFlooding(event.pubkey, channel)) {
                return;
            }

            // Only track flood for new messages in this channel
            if (!isHistorical) {
                this.trackMessage(event.pubkey, channel, isHistorical);
            }

            // Check for BRB auto-response (UNIVERSAL) - only for NEW messages
            if (!isHistorical && this.isMentioned(event.content) && this.awayMessages.has(this.pubkey)) {
                // Check if we haven't already responded to this user in this session
                const responseKey = `brb_universal_${this.pubkey}_${nym}`;
                if (!sessionStorage.getItem(responseKey)) {
                    sessionStorage.setItem(responseKey, '1');

                    // Send auto-response to the same channel where mentioned
                    const response = `@${nym} [Auto-Reply] ${this.awayMessages.get(this.pubkey)}`;
                    await this.publishMessage(response, channel, '');
                }
            }

            // Add channel if it's new (and not blocked)
            if (!this.channels.has(channel) && !this.isChannelBlocked(channel, '')) {
                this.addChannelToList(channel, '');
            }

            const message = {
                id: event.id,
                author: nym,
                pubkey: event.pubkey,
                content: event.content,
                timestamp: new Date(event.created_at * 1000),
                channel: channel,
                geohash: '',
                isOwn: event.pubkey === this.pubkey,
                isHistorical: isHistorical
            };

            // Don't display duplicate of own messages
            if (!this.isDuplicateMessage(message)) {
                this.displayMessage(message);
                this.updateUserPresence(nym, event.pubkey, channel, '');

                // Show notification only if mentioned and not blocked
                if (!message.isOwn && document.hidden && this.isMentioned(message.content) && !this.blockedUsers.has(nym)) {
                    this.showNotification(nym, message.content);
                }
            }
        } else if (event.kind === 7) {
            // Handle reactions (NIP-25)
            this.handleReaction(event);
        } else if (event.kind === 9735) {
            // Handle zap receipt (NIP-57)
            this.handleZapReceipt(event);
        } else if (event.kind === 4) {
            // Handle legacy NIP-04 encrypted DMs
            await this.handleEncryptedDM(event);
        } else if (event.kind === 30078) {
            // Handle synced settings
            this.handleSyncedSettings(event);
        }
    }

    isSpamMessage(content) {
        // Check if spam filter is disabled
        if (this.spamFilterEnabled === false) return false;

        // Remove whitespace to check the core content
        const trimmed = content.trim();

        // Allow empty messages or very short ones
        if (trimmed.length < 20) return false;

        // Block client spam
        if (trimmed.includes('joined the channel via bitchat.land')) return true;

        // Check if it's a URL (contains :// or starts with www.)
        if (trimmed.includes('://') || trimmed.startsWith('www.')) return false;

        // Check for Lightning invoices (lnbc, lntb, lnts prefixes)
        if (/^ln(bc|tb|ts)/i.test(trimmed)) return false;

        // Check for Cashu tokens
        if (/^cashu/i.test(trimmed)) return false;

        // Check for Nostr identifiers (npub/nsec/note/nevent/naddr)
        if (/^(npub|nsec|note|nevent|naddr)1[a-z0-9]+$/i.test(trimmed)) return false;

        // Check for code blocks or formatted content
        if (trimmed.includes('```') || trimmed.includes('`')) return false;

        const words = trimmed.split(/[\s\u3000\u2000-\u200B\u0020\u00A0.,;!?。、，；！？\n]/);
        const longestWord = Math.max(...words.map(w => w.length));

        if (longestWord > 100) {
            if (trimmed.startsWith('data:image')) return false;

            const hasOnlyAlphaNumeric = /^[a-zA-Z0-9]+$/.test(trimmed);
            if (hasOnlyAlphaNumeric && trimmed.length > 100) {
                return true;
            }

            if (/^[a-zA-Z0-9]+$/.test(words.find(w => w.length > 100))) {
                const longWord = words.find(w => w.length > 100);
                const charFreq = {};
                for (const char of longWord) {
                    charFreq[char] = (charFreq[char] || 0) + 1;
                }

                const frequencies = Object.values(charFreq);
                const avgFreq = longWord.length / Object.keys(charFreq).length;
                const variance = frequencies.reduce((sum, freq) => sum + Math.pow(freq - avgFreq, 2), 0) / frequencies.length;

                if (variance < 2 && longWord.length > 100) {
                    return true;
                }
            }
        }

        return false;
    }

    async sendBRBResponse(mentioner, awayMessage) {
        // Send auto-response only once per mentioner
        const responseKey = `brb_${this.pubkey}_${mentioner}`;
        if (sessionStorage.getItem(responseKey)) {
            return; // Already sent response to this user
        }

        sessionStorage.setItem(responseKey, '1');
        const response = `@${mentioner} [Auto-Reply] ${awayMessage}`;
        await this.publishMessage(response, this.currentChannel, this.currentGeohash);
    }

    handleSyncedSettings(event) {
        if (event.pubkey !== this.pubkey) return;

        try {
            const settings = JSON.parse(event.content);

            // Restore proximity sorting preference
            if (settings.sortByProximity !== undefined) {
                this.settings.sortByProximity = settings.sortByProximity;
                localStorage.setItem('nym_sort_proximity', settings.sortByProximity);

                // If enabled, try to get location
                if (settings.sortByProximity && !this.userLocation) {
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            this.userLocation = {
                                lat: position.coords.latitude,
                                lng: position.coords.longitude
                            };
                            this.sortChannelsByActivity();
                            console.log('Location restored for proximity sorting');
                        },
                        (error) => {
                            console.log('Location access denied during settings restore');
                            this.settings.sortByProximity = false;
                            localStorage.setItem('nym_sort_proximity', 'false');
                        }
                    );
                }
            }

            // Apply theme
            if (settings.theme) {
                this.settings.theme = settings.theme;
                this.applyTheme(settings.theme);
                localStorage.setItem('nym_theme', settings.theme);
            }

            // Apply sound settings
            if (settings.sound !== undefined) {
                this.settings.sound = settings.sound;
                localStorage.setItem('nym_sound', settings.sound);
            }

            // Apply autoscroll
            if (settings.autoscroll !== undefined) {
                this.settings.autoscroll = settings.autoscroll;
                localStorage.setItem('nym_autoscroll', settings.autoscroll);
            }

            // Apply timestamp settings
            if (settings.showTimestamps !== undefined) {
                this.settings.showTimestamps = settings.showTimestamps;
                localStorage.setItem('nym_timestamps', settings.showTimestamps);
            }

            // Restore pinned channels
            if (settings.pinnedChannels) {
                this.pinnedChannels = new Set(settings.pinnedChannels);
                localStorage.setItem('nym_pinned_channels', JSON.stringify(settings.pinnedChannels));
                this.updateChannelPins();
            }

            // Restore blocked channels
            if (settings.blockedChannels) {
                this.blockedChannels = new Set(settings.blockedChannels);
                localStorage.setItem('nym_blocked_channels', JSON.stringify(settings.blockedChannels));
                this.updateBlockedChannelsList();
            }

            // Restore blocked users
            if (settings.blockedUsers) {
                this.blockedUsers = new Set(settings.blockedUsers);
                localStorage.setItem('nym_blocked', JSON.stringify(settings.blockedUsers));
                this.updateBlockedList();
            }

            // Restore blocked keywords
            if (settings.blockedKeywords) {
                this.blockedKeywords = new Set(settings.blockedKeywords);
                localStorage.setItem('nym_blocked_keywords', JSON.stringify(settings.blockedKeywords));
                this.updateKeywordList();
            }

            // Restore user joined channels
            if (settings.userJoinedChannels) {
                // Clear existing and restore from sync
                this.userJoinedChannels.clear();

                settings.userJoinedChannels.forEach(key => {
                    this.userJoinedChannels.add(key);
                    // Parse and add channel if not already present
                    if (!this.channels.has(key)) {
                        if (this.isValidGeohash(key)) {
                            this.addChannel(key, key);
                        } else {
                            this.addChannel(key, '');
                        }
                    }
                });

                // Save to localStorage
                localStorage.setItem('nym_user_joined_channels', JSON.stringify(settings.userJoinedChannels));
                localStorage.setItem('nym_user_channels', JSON.stringify(
                    settings.userJoinedChannels.map(key => ({
                        key: key,
                        channel: this.isValidGeohash(key) ? key : key,
                        geohash: this.isValidGeohash(key) ? key : ''
                    }))
                ));
            }

            // Restore lightning address
            if (settings.lightningAddress) {
                this.lightningAddress = settings.lightningAddress;
                localStorage.setItem(`nym_lightning_address_${this.pubkey}`, settings.lightningAddress);
                this.updateLightningAddressDisplay();

                // Update in settings modal if open
                const lightningInput = document.getElementById('lightningAddressInput');
                if (lightningInput) {
                    lightningInput.value = settings.lightningAddress;
                }
            }

            // Update UI elements if settings modal is open
            if (document.getElementById('settingsModal').classList.contains('active')) {
                document.getElementById('themeSelect').value = this.settings.theme;
                document.getElementById('soundSelect').value = this.settings.sound;
                document.getElementById('autoscrollSelect').value = String(this.settings.autoscroll);
                document.getElementById('timestampSelect').value = String(this.settings.showTimestamps);
            }

            //this.displaySystemMessage('Settings synced from Nostr');
            console.log('Settings synced successfully:', Object.keys(settings));
        } catch (error) {
            console.error('Failed to parse synced settings:', error);
        }
    }

    handleReaction(event) {
        const reactionContent = event.content;
        const eTag = event.tags.find(t => t[0] === 'e');
        const kTag = event.tags.find(t => t[0] === 'k');

        if (!eTag) return;

        // Only process reactions for our supported kinds
        if (kTag && !['20000', '23333', '4'].includes(kTag[1])) {
            return;
        }

        const messageId = eTag[1];
        const reactorNym = this.getNymFromPubkey(event.pubkey);

        // Store reaction with pubkey and nym
        if (!this.reactions.has(messageId)) {
            this.reactions.set(messageId, new Map());
        }

        const messageReactions = this.reactions.get(messageId);
        if (!messageReactions.has(reactionContent)) {
            messageReactions.set(reactionContent, new Map()); // Map of pubkey -> nym
        }

        // Store pubkey with nym
        messageReactions.get(reactionContent).set(event.pubkey, reactorNym);

        // Update UI if message is visible
        this.updateMessageReactions(messageId);
    }

    updateMessageReactions(messageId) {
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageEl) return;

        const reactions = this.reactions.get(messageId);
        if (!reactions || reactions.size === 0) {
            // Even if no reactions, update zaps display
            this.updateMessageZaps(messageId);
            return;
        }

        // Hide the hover reaction button since we have reactions
        const hoverReactionBtn = messageEl.querySelector('.reaction-btn');
        if (hoverReactionBtn) {
            hoverReactionBtn.style.display = 'none';
        }

        // Remove existing reactions display but preserve zap badges
        let reactionsRow = messageEl.querySelector('.reactions-row');
        let zapBadge = null;
        let addZapBtn = null;

        if (reactionsRow) {
            // Save zap badge and button if they exist
            zapBadge = reactionsRow.querySelector('.zap-badge');
            if (zapBadge) {
                zapBadge = zapBadge.cloneNode(true);
            }
            addZapBtn = reactionsRow.querySelector('.add-zap-btn');
            if (addZapBtn) {
                addZapBtn = addZapBtn.cloneNode(true);
            }
        }

        if (!reactionsRow) {
            reactionsRow = document.createElement('div');
            reactionsRow.className = 'reactions-row';
            messageEl.appendChild(reactionsRow);
        }

        // Clear and rebuild reactions
        reactionsRow.innerHTML = '';

        // Re-add zap badge first if it exists
        if (zapBadge) {
            reactionsRow.appendChild(zapBadge);
        }

        // Re-add quick zap button ONLY if it already existed (meaning there are zaps)
        if (addZapBtn) {
            reactionsRow.appendChild(addZapBtn);
            // Re-attach the click handler
            const pubkey = messageEl.dataset.pubkey;
            addZapBtn.onclick = async (e) => {
                e.stopPropagation();
                await this.handleQuickZap(messageId, pubkey, messageEl);
            };
        }
        // DO NOT create a new quick zap button here - only in updateMessageZaps when zaps exist

        // Clear and rebuild reactions
        reactions.forEach((reactors, emoji) => {
            const badge = document.createElement('span');

            // Check if current user has already reacted with this emoji
            const hasReacted = reactors.has(this.pubkey);

            // Set class based on reaction state
            badge.className = hasReacted ? 'reaction-badge user-reacted' : 'reaction-badge';
            badge.dataset.emoji = emoji;
            badge.dataset.messageId = messageId;

            badge.innerHTML = `${emoji} ${reactors.size}`;

            // Create tooltip with user names
            if (hasReacted) {
                const otherUsers = Array.from(reactors.entries())
                    .filter(([pk, nym]) => pk !== this.pubkey)
                    .map(([pk, nym]) => nym);
                badge.title = otherUsers.length > 0 ?
                    `You and ${otherUsers.join(', ')}` :
                    'You reacted with this';
            } else {
                const users = Array.from(reactors.values()).join(', ');
                badge.title = `Click to also react with ${emoji} | ${users}`;
            }

            // Add click handler that updates badge immediately
            badge.onclick = async (e) => {
                e.stopPropagation();
                if (!hasReacted) {
                    // Immediately update the badge visual state
                    badge.className = 'reaction-badge user-reacted';
                    badge.style.background = 'rgba(0, 255, 0, 0.2)';
                    badge.style.borderColor = 'var(--primary)';
                    badge.style.boxShadow = '0 0 5px rgba(0, 255, 0, 0.3)';

                    // Update count
                    const newCount = reactors.size + 1;
                    badge.innerHTML = `${emoji} ${newCount}`;

                    // Send the reaction
                    await this.sendReaction(messageId, emoji);
                } else {
                    this.displaySystemMessage(`You already reacted with ${emoji}`);
                }
            };

            reactionsRow.appendChild(badge);
        });

        // Adds "add reaction" badge
        const addBtn = document.createElement('span');
        addBtn.className = 'add-reaction-btn';
        addBtn.innerHTML = `
<svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10"></circle>
    <circle cx="9" cy="9" r="1"></circle>
    <circle cx="15" cy="9" r="1"></circle>
    <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
    <circle cx="18" cy="6" r="5" fill="var(--text)" stroke="none"></circle>
    <line x1="18" y1="4" x2="18" y2="8" stroke="var(--bg)" stroke-width="1.5" stroke-linecap="round"></line>
    <line x1="16" y1="6" x2="20" y2="6" stroke="var(--bg)" stroke-width="1.5" stroke-linecap="round"></line>
</svg>
`;
        addBtn.title = 'Add reaction';
        addBtn.onclick = (e) => {
            e.stopPropagation();
            this.showEnhancedReactionPicker(messageId, addBtn);
        };
        reactionsRow.appendChild(addBtn);
    }

    showReactionPicker(messageId, button) {
        // Toggle if clicking same button
        if (this.enhancedEmojiModal && this.activeReactionPickerButton === button) {
            this.closeEnhancedEmojiModal();
            this.activeReactionPickerButton = null;
            return;
        }

        // Remember which button opened this
        this.activeReactionPickerButton = button;

        // Use enhanced picker
        this.showEnhancedReactionPicker(messageId, button);
    }

    showEnhancedReactionPicker(messageId, button) {
        // Check if clicking the same button that opened the current modal
        if (this.enhancedEmojiModal && this.activeReactionPickerButton === button) {
            this.closeEnhancedEmojiModal();
            return;
        }

        // Close any existing picker
        this.closeEnhancedEmojiModal();

        // Remember which button opened this
        this.activeReactionPickerButton = button;

        const modal = document.createElement('div');
        modal.className = 'enhanced-emoji-modal active';

        // Create reverse lookup for emoji names
        const emojiToNames = {};
        Object.entries(this.emojiMap).forEach(([name, emoji]) => {
            if (!emojiToNames[emoji]) {
                emojiToNames[emoji] = [];
            }
            emojiToNames[emoji].push(name);
        });

        modal.innerHTML = `
<div class="emoji-modal-header">
    <input type="text" class="emoji-search-input" placeholder="Search emoji by name..." id="emojiSearchInput">
</div>
${this.recentEmojis.length > 0 ? `
    <div class="emoji-section">
        <div class="emoji-section-title">Recently Used</div>
        <div class="emoji-grid">
            ${this.recentEmojis.map(emoji =>
            `<button class="emoji-option" data-emoji="${emoji}" title="${emojiToNames[emoji] ? emojiToNames[emoji].join(', ') : ''}">${emoji}</button>`
        ).join('')}
        </div>
    </div>
` : ''}
${Object.entries(this.allEmojis).map(([category, emojis]) => `
    <div class="emoji-section" data-category="${category}">
        <div class="emoji-section-title">${category.charAt(0).toUpperCase() + category.slice(1)}</div>
        <div class="emoji-grid">
            ${emojis.map(emoji => {
            const names = emojiToNames[emoji] || [];
            return `<button class="emoji-option" data-emoji="${emoji}" data-names="${names.join(' ')}" title="${names.join(', ')}">${emoji}</button>`;
        }).join('')}
        </div>
    </div>
`).join('')}
`;

        // Position modal
        const rect = button.getBoundingClientRect();
        modal.style.position = 'fixed';

        // Check if on mobile
        if (window.innerWidth <= 768) {
            // Center on mobile
            modal.style.top = '50%';
            modal.style.left = '50%';
            modal.style.transform = 'translate(-50%, -50%)';
            modal.style.maxWidth = '90%';
            modal.style.maxHeight = '80vh';
            modal.style.zIndex = '10000';
        } else {
            // Desktop positioning - check if near top of screen
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;

            if (spaceBelow > 450 || spaceBelow > spaceAbove) {
                // Show below button
                modal.style.top = (rect.bottom + 10) + 'px';
                modal.style.bottom = 'auto';
            } else {
                // Show above button
                modal.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
                modal.style.top = 'auto';
            }

            // Horizontal positioning
            if (rect.left > window.innerWidth * 0.5) {
                modal.style.right = Math.min(window.innerWidth - rect.right, 10) + 'px';
                modal.style.left = 'auto';
            } else {
                modal.style.left = Math.max(rect.left, 10) + 'px';
                modal.style.right = 'auto';
            }

            modal.style.maxHeight = '400px';
        }

        document.body.appendChild(modal);
        this.enhancedEmojiModal = modal;

        // Add search functionality
        const searchInput = modal.querySelector('#emojiSearchInput');
        searchInput.addEventListener('input', (e) => {
            const search = e.target.value.toLowerCase();
            modal.querySelectorAll('.emoji-option').forEach(btn => {
                const emoji = btn.textContent;
                const names = btn.dataset.names || '';
                const shouldShow = !search ||
                    emoji.includes(search) ||
                    names.toLowerCase().includes(search);
                btn.style.display = shouldShow ? '' : 'none';
            });
            // Hide empty sections
            modal.querySelectorAll('.emoji-section').forEach(section => {
                const hasVisible = Array.from(section.querySelectorAll('.emoji-option'))
                    .some(btn => btn.style.display !== 'none');
                section.style.display = hasVisible ? '' : 'none';
            });
        });

        // Add click handlers
        modal.querySelectorAll('.emoji-option').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const emoji = btn.dataset.emoji;
                this.addToRecentEmojis(emoji);
                await this.sendReaction(messageId, emoji);
                this.closeEnhancedEmojiModal();
            };
        });

        // Focus search
        searchInput.focus();
    }

    toggleEmojiPicker() {
        // Check if modal already exists
        if (this.enhancedEmojiModal) {
            // Close existing modal
            this.closeEnhancedEmojiModal();
            return;
        }

        // Create modal for emoji picker
        const button = document.querySelector('.icon-btn.input-btn[title="Emoji"]');
        if (button) {
            this.showEnhancedEmojiPickerForInput(button);
        }
    }

    showEnhancedEmojiPickerForInput(button) {
        // Close any existing picker
        this.closeEnhancedEmojiModal();

        const modal = document.createElement('div');
        modal.className = 'enhanced-emoji-modal active';

        // Create reverse lookup for emoji names
        const emojiToNames = {};
        Object.entries(this.emojiMap).forEach(([name, emoji]) => {
            if (!emojiToNames[emoji]) {
                emojiToNames[emoji] = [];
            }
            emojiToNames[emoji].push(name);
        });

        modal.innerHTML = `
<div class="emoji-modal-header">
    <input type="text" class="emoji-search-input" placeholder="Search emoji by name..." id="emojiSearchInput">
</div>
${this.recentEmojis.length > 0 ? `
    <div class="emoji-section">
        <div class="emoji-section-title">Recently Used</div>
        <div class="emoji-grid">
            ${this.recentEmojis.map(emoji =>
            `<button class="emoji-option" data-emoji="${emoji}" title="${emojiToNames[emoji] ? emojiToNames[emoji].join(', ') : ''}">${emoji}</button>`
        ).join('')}
        </div>
    </div>
` : ''}
${Object.entries(this.allEmojis).map(([category, emojis]) => `
    <div class="emoji-section" data-category="${category}">
        <div class="emoji-section-title">${category.charAt(0).toUpperCase() + category.slice(1)}</div>
        <div class="emoji-grid">
            ${emojis.map(emoji => {
            const names = emojiToNames[emoji] || [];
            return `<button class="emoji-option" data-emoji="${emoji}" data-names="${names.join(' ')}" title="${names.join(', ')}">${emoji}</button>`;
        }).join('')}
        </div>
    </div>
`).join('')}
`;

        // Position near button
        const rect = button.getBoundingClientRect();
        modal.style.position = 'fixed';

        // Check if on mobile
        if (window.innerWidth <= 768) {
            modal.style.bottom = '60px';
            modal.style.left = '50%';
            modal.style.transform = 'translateX(-50%)';
            modal.style.right = 'auto';
            modal.style.maxWidth = '90%';
        } else {
            modal.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
            modal.style.right = Math.min(window.innerWidth - rect.right + 50, 10) + 'px';
        }

        document.body.appendChild(modal);
        this.enhancedEmojiModal = modal;

        // Add search functionality
        const searchInput = modal.querySelector('#emojiSearchInput');
        searchInput.addEventListener('input', (e) => {
            const search = e.target.value.toLowerCase();
            modal.querySelectorAll('.emoji-option').forEach(btn => {
                const emoji = btn.textContent;
                const names = btn.dataset.names || '';
                const shouldShow = !search ||
                    emoji.includes(search) ||
                    names.toLowerCase().includes(search);
                btn.style.display = shouldShow ? '' : 'none';
            });
            // Hide empty sections
            modal.querySelectorAll('.emoji-section').forEach(section => {
                const hasVisible = Array.from(section.querySelectorAll('.emoji-option'))
                    .some(btn => btn.style.display !== 'none');
                section.style.display = hasVisible ? '' : 'none';
            });
        });

        // Add click handlers for inserting emoji into input
        modal.querySelectorAll('.emoji-option').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const emoji = btn.dataset.emoji;
                this.insertEmoji(emoji);
                this.closeEnhancedEmojiModal();
            };
        });

        // Focus search
        searchInput.focus();
    }

    closeEnhancedEmojiModal() {
        if (this.enhancedEmojiModal) {
            this.enhancedEmojiModal.remove();
            this.enhancedEmojiModal = null;
        }
        // Clear the button reference
        this.activeReactionPickerButton = null;
    }

    async sendReaction(messageId, emoji) {
        try {
            // Find the original message element to get the pubkey
            const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
            if (!messageEl) {
                console.error('Message element not found');
                return;
            }

            const targetPubkey = messageEl.dataset.pubkey;
            if (!targetPubkey) {
                console.error('Could not find target pubkey');
                return;
            }

            // Update local reactions state
            if (!this.reactions.has(messageId)) {
                this.reactions.set(messageId, new Map());
            }
            const messageReactions = this.reactions.get(messageId);
            if (!messageReactions.has(emoji)) {
                messageReactions.set(emoji, new Map());
            }

            // Check if already reacted
            if (messageReactions.get(emoji).has(this.pubkey)) {
                return; // Already reacted
            }

            // Add current user's reaction to state
            messageReactions.get(emoji).set(this.pubkey, this.nym);

            // Determine the kind based on current context
            let originalKind = '23333'; // Default to standard channel
            if (this.inPMMode) {
                originalKind = '4'; // PM
            } else if (this.currentGeohash) {
                originalKind = '20000'; // Geohash channel
            }

            // Send to relay with proper k tag
            const event = {
                kind: 7,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['e', messageId],
                    ['p', targetPubkey],
                    ['k', originalKind] // Add the kind of the original message
                ],
                content: emoji,
                pubkey: this.pubkey
            };

            // Sign event
            let signedEvent;
            if (window.nostr && !this.privkey) {
                signedEvent = await window.nostr.signEvent(event);
            } else if (this.privkey) {
                signedEvent = NostrTools.finalizeEvent(event, this.privkey);
            }

            if (signedEvent) {
                this.sendToRelay(["EVENT", signedEvent]);
                this.addToRecentEmojis(emoji);
            } else {
                // If signing failed, revert the visual update
                messageReactions.get(emoji).delete(this.pubkey);
                this.updateMessageReactions(messageId);
                this.displaySystemMessage('Failed to sign reaction');
            }
        } catch (error) {
            console.error('Failed to send reaction:', error);
            // Revert on error
            const messageReactions = this.reactions.get(messageId);
            if (messageReactions && messageReactions.has(emoji)) {
                messageReactions.get(emoji).delete(this.pubkey);
                this.updateMessageReactions(messageId);
            }
        }
    }

    trackMessage(pubkey, channel, isHistorical = false) {
        // Don't track historical messages from initial load
        if (isHistorical) {
            return;
        }

        const now = Date.now();
        const channelKey = channel; // Use channel as key for per-channel tracking

        // Create channel-specific tracking
        if (!this.floodTracking.has(channelKey)) {
            this.floodTracking.set(channelKey, new Map());
        }

        const channelTracking = this.floodTracking.get(channelKey);

        if (!channelTracking.has(pubkey)) {
            channelTracking.set(pubkey, {
                count: 1,
                firstMessageTime: now,
                blocked: false
            });
            return;
        }

        const tracking = channelTracking.get(pubkey);

        // Reset if more than 2 seconds have passed
        if (now - tracking.firstMessageTime > 2000) {
            tracking.count = 1;
            tracking.firstMessageTime = now;
            tracking.blocked = false;
        } else {
            tracking.count++;

            // Block if more than 10 messages in 2 seconds IN THIS CHANNEL
            if (tracking.count > 10 && !tracking.blocked) {
                tracking.blocked = true;
                tracking.blockedUntil = now + 900000; // 15 minutes

                const nym = this.getNymFromPubkey(pubkey);
                this.displaySystemMessage(`${nym} has been temporarily muted for flooding in #${channel} (15 minutes)`);
            }
        }
    }

    isFlooding(pubkey, channel) {
        const channelTracking = this.floodTracking.get(channel);
        if (!channelTracking) return false;

        const tracking = channelTracking.get(pubkey);
        if (!tracking) return false;

        if (tracking.blocked) {
            const now = Date.now();
            if (now < tracking.blockedUntil) {
                return true;
            } else {
                // Unblock after timeout
                tracking.blocked = false;
                tracking.blockedUntil = null;
            }
        }

        return false;
    }

    async handleEncryptedDM(event) {
        try {
            // Only process kind 4 events
            if (event.kind !== 4) return;

            // Find the p tag to see who the message is for/from
            const pTag = event.tags.find(t => t[0] === 'p');
            if (!pTag) return;

            const otherPubkey = pTag[1];

            // Determine if this is a message TO us or FROM us
            let conversationPubkey;
            let isIncoming = false;

            if (otherPubkey === this.pubkey && event.pubkey !== this.pubkey) {
                // Message is TO us from someone else
                isIncoming = true;
                conversationPubkey = event.pubkey;
            } else if (event.pubkey === this.pubkey && otherPubkey !== this.pubkey) {
                // Message is FROM us to someone else
                isIncoming = false;
                conversationPubkey = otherPubkey;
            } else {
                // Message is not part of our conversations, ignore
                return;
            }

            // Create conversation key for this PM pair
            const conversationKey = this.getPMConversationKey(conversationPubkey);

            // Check if we already have this exact message (prevent duplicates)
            const existingMessages = this.pmMessages.get(conversationKey) || [];
            const exists = existingMessages.some(m => m.id === event.id);
            if (exists) return; // Skip if already processed

            // Decrypt the message
            let decryptedContent;
            try {
                if (window.nostr && !this.privkey) {
                    // Use extension to decrypt
                    decryptedContent = await window.nostr.nip04.decrypt(
                        conversationPubkey,
                        event.content
                    );
                } else if (this.privkey) {
                    // Use local keys to decrypt
                    decryptedContent = await this.decryptNIP04(
                        event.content,
                        conversationPubkey,
                        this.privkey
                    );
                } else {
                    return;
                }
            } catch (err) {
                console.error('Failed to decrypt PM:', err);
                return;
            }

            if (!decryptedContent) return;

            // Extract nym from the decrypted content if it contains a nym tag
            let senderNym;
            let actualContent = decryptedContent;
            try {
                // Check if the decrypted content has embedded nym info
                const contentData = JSON.parse(decryptedContent);
                if (contentData.nym) {
                    senderNym = contentData.nym;
                    actualContent = contentData.content;
                } else {
                    senderNym = this.getNymFromPubkey(event.pubkey);
                }
            } catch {
                // If not JSON, use the content as-is
                senderNym = this.getNymFromPubkey(event.pubkey);
            }

            // Update user tracking with the nym
            if (!this.users.has(event.pubkey) || this.users.get(event.pubkey).nym.startsWith('anon-')) {
                this.users.set(event.pubkey, {
                    nym: senderNym,
                    pubkey: event.pubkey,
                    lastSeen: Date.now(),
                    status: 'online',
                    channels: new Set()
                });
            }

            // Check if sender is blocked
            if (isIncoming && this.blockedUsers.has(senderNym)) {
                return;
            }

            if (!this.pmMessages.has(conversationKey)) {
                this.pmMessages.set(conversationKey, []);
            }

            // Check if this is a historical message (older than 10 seconds)
            const messageAge = Date.now() - (event.created_at * 1000);
            const isHistorical = messageAge > 10000;

            // Add PM conversation if not exists
            if (!this.pmConversations.has(conversationPubkey)) {
                const otherNym = isIncoming ? senderNym : this.getNymFromPubkey(conversationPubkey);
                this.addPMConversation(otherNym, conversationPubkey, event.created_at * 1000);
            } else {
                // Update existing conversation with new timestamp
                const conversation = this.pmConversations.get(conversationPubkey);
                if (conversation) {
                    conversation.lastMessageTime = event.created_at * 1000;
                    conversation.nym = isIncoming ? senderNym : conversation.nym; // Update nym if needed
                }

                // Update DOM element timestamp and reorder
                const pmItem = document.querySelector(`[data-pubkey="${conversationPubkey}"]`);
                if (pmItem) {
                    pmItem.dataset.lastMessageTime = event.created_at * 1000;

                    // Reorder PMs to maintain chronological order
                    if (!isHistorical) {
                        this.reorderPMs();
                    }
                }
            }

            // Store the PM message with the actual event ID from the relay
            const pmMessage = {
                id: event.id,
                author: isIncoming ? senderNym : this.nym,
                pubkey: event.pubkey,
                content: actualContent,
                timestamp: new Date(event.created_at * 1000),
                isOwn: !isIncoming,
                isPM: true,
                conversationKey: conversationKey,
                conversationPubkey: conversationPubkey,
                isHistorical: isHistorical
            };

            this.pmMessages.get(conversationKey).push(pmMessage);

            // Sort messages by timestamp
            this.pmMessages.get(conversationKey).sort((a, b) => a.timestamp - b.timestamp);

            // Display if in PM mode with this user
            if (this.inPMMode && this.currentPM === conversationPubkey) {
                this.displayMessage(pmMessage);
            } else if (isIncoming && !isHistorical) {
                // Only update unread count and show notification for NEW incoming messages
                this.updateUnreadCount(conversationKey);
                // Show notification only for new messages
                if (document.hidden || !this.inPMMode || this.currentPM !== conversationPubkey) {
                    this.showNotification(`PM from ${senderNym}`, actualContent);
                }
            }

        } catch (error) {
            console.error('Failed to handle encrypted DM:', error);
        }
    }

    async decryptNIP04(content, pubkey, privkey) {
        try {
            // Use nostr-tools nip04 decrypt function
            if (typeof NostrTools.nip04 !== 'undefined') {
                const decrypted = await NostrTools.nip04.decrypt(privkey, pubkey, content);
                return decrypted;
            }

            // Fallback: Parse the encrypted content
            const [ciphertext, iv] = content.split('?iv=');
            if (!iv) throw new Error('Invalid encrypted format');

            // Convert hex privkey to Uint8Array if needed
            let privkeyBytes;
            if (typeof privkey === 'string') {
                privkeyBytes = new Uint8Array(privkey.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            } else {
                privkeyBytes = privkey;
            }

            // Convert hex pubkey to Uint8Array
            const pubkeyBytes = new Uint8Array(pubkey.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

            // Generate shared secret using secp256k1
            // Since we're using nostr-tools, we can use its internal functions
            const sharedPoint = NostrTools.getSharedSecret(privkeyBytes, '02' + pubkey);
            const sharedSecret = sharedPoint.substring(2, 66);

            // Derive key using SHA-256
            const encoder = new TextEncoder();
            const sharedSecretBytes = new Uint8Array(sharedSecret.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                sharedSecretBytes,
                { name: 'HKDF' },
                false,
                ['deriveKey']
            );

            // Derive AES key
            const aesKey = await crypto.subtle.deriveKey(
                {
                    name: 'HKDF',
                    salt: new Uint8Array(0),
                    info: encoder.encode('nip04-v1'),
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-CBC', length: 256 },
                false,
                ['decrypt']
            );

            // Decode base64 ciphertext and IV
            const ciphertextBytes = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
            const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));

            // Decrypt
            const decryptedBytes = await crypto.subtle.decrypt(
                { name: 'AES-CBC', iv: ivBytes },
                aesKey,
                ciphertextBytes
            );

            // Convert to string
            const decoder = new TextDecoder();
            return decoder.decode(decryptedBytes);

        } catch (error) {
            console.error('NIP-04 decryption failed:', error);

            // Try a simpler approach if nostr-tools methods are available
            try {
                if (NostrTools && NostrTools.nip04) {
                    return await NostrTools.nip04.decrypt(privkey, pubkey, content);
                }
            } catch (fallbackError) {
                console.error('Fallback decryption also failed:', fallbackError);
            }

            return null;
        }
    }

    async encryptNIP04(content, pubkey, privkey) {
        try {
            // Use nostr-tools nip04 encrypt function
            if (typeof NostrTools.nip04 !== 'undefined') {
                const encrypted = await NostrTools.nip04.encrypt(privkey, pubkey, content);
                return encrypted;
            }

            // Fallback: Manual implementation
            // Convert hex privkey to Uint8Array if needed
            let privkeyBytes;
            if (typeof privkey === 'string') {
                privkeyBytes = new Uint8Array(privkey.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            } else {
                privkeyBytes = privkey;
            }

            // Convert hex pubkey to Uint8Array
            const pubkeyBytes = new Uint8Array(pubkey.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

            // Generate shared secret using secp256k1
            const sharedPoint = NostrTools.getSharedSecret(privkeyBytes, '02' + pubkey);
            const sharedSecret = sharedPoint.substring(2, 66); // Remove '02' prefix and take x coordinate

            // Derive key using SHA-256
            const encoder = new TextEncoder();
            const sharedSecretBytes = new Uint8Array(sharedSecret.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                sharedSecretBytes,
                { name: 'HKDF' },
                false,
                ['deriveKey']
            );

            // Derive AES key
            const aesKey = await crypto.subtle.deriveKey(
                {
                    name: 'HKDF',
                    salt: new Uint8Array(0),
                    info: encoder.encode('nip04-v1'),
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-CBC', length: 256 },
                false,
                ['encrypt']
            );

            // Generate random IV
            const iv = crypto.getRandomValues(new Uint8Array(16));

            // Encrypt the content
            const contentBytes = encoder.encode(content);
            const ciphertext = await crypto.subtle.encrypt(
                { name: 'AES-CBC', iv: iv },
                aesKey,
                contentBytes
            );

            // Convert to base64
            const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
            const ivBase64 = btoa(String.fromCharCode(...iv));

            // Return in NIP-04 format
            return `${ciphertextBase64}?iv=${ivBase64}`;

        } catch (error) {
            console.error('NIP-04 encryption failed:', error);

            // Try a simpler approach if nostr-tools methods are available
            try {
                if (NostrTools && NostrTools.nip04) {
                    return await NostrTools.nip04.encrypt(privkey, pubkey, content);
                }
            } catch (fallbackError) {
                console.error('Fallback encryption also failed:', fallbackError);
            }

            return null;
        }
    }

    getPMConversationKey(otherPubkey) {
        // Create a unique key for this PM conversation between two users
        const keys = [this.pubkey, otherPubkey].sort();
        return `pm-${keys.join('-')}`;
    }

    async sendPM(content, recipientPubkey) {
        try {
            if (!this.connected) {
                throw new Error('Not connected to relay');
            }

            // Use NIP-04 for private messages
            const signedEvent = await this.sendNIP04PM(content, recipientPubkey);

            if (signedEvent) {
                // Display own PM immediately with the actual event ID
                const conversationKey = this.getPMConversationKey(recipientPubkey);
                if (!this.pmMessages.has(conversationKey)) {
                    this.pmMessages.set(conversationKey, []);
                }

                const pmMessage = {
                    id: signedEvent.id, // Use the actual signed event ID
                    author: this.nym,
                    pubkey: this.pubkey,
                    content: content,
                    timestamp: new Date(),
                    isOwn: true,
                    isPM: true,
                    conversationKey: conversationKey,
                    conversationPubkey: recipientPubkey
                };

                this.pmMessages.get(conversationKey).push(pmMessage);

                if (this.inPMMode && this.currentPM === recipientPubkey) {
                    this.displayMessage(pmMessage);
                }

                return true;
            }

            return false;
        } catch (error) {
            console.error('Failed to send PM:', error);
            this.displaySystemMessage('Failed to send PM: ' + error.message);
            return false;
        }
    }

    async sendNIP04PM(content, recipientPubkey) {
        try {
            // Create message payload with nym
            const messagePayload = JSON.stringify({
                nym: this.nym,
                content: content
            });

            // Encrypt the message
            let encryptedContent;
            if (window.nostr && !this.privkey) {
                // Use extension to encrypt
                encryptedContent = await window.nostr.nip04.encrypt(recipientPubkey, messagePayload);
            } else if (this.privkey) {
                // Use local keys to encrypt
                encryptedContent = await this.encryptNIP04(messagePayload, recipientPubkey, this.privkey);
            } else {
                throw new Error('No encryption method available');
            }

            // Create NIP-04 DM event
            const event = {
                kind: 4, // NIP-04 encrypted direct message
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['p', recipientPubkey] // Tag ONLY the recipient
                ],
                content: encryptedContent,
                pubkey: this.pubkey
            };

            // Sign and send the event
            let signedEvent;
            if (window.nostr && !this.privkey) {
                signedEvent = await window.nostr.signEvent(event);
            } else if (this.privkey) {
                signedEvent = NostrTools.finalizeEvent(event, this.privkey);
            } else {
                throw new Error('No signing method available');
            }

            this.sendToRelay(["EVENT", signedEvent]);

            return signedEvent; // Return the signed event so we can use its ID
        } catch (error) {
            console.error('Failed to send NIP-04 PM:', error);
            throw error;
        }
    }

    movePMToTop(pubkey) {
        const pmList = document.getElementById('pmList');
        const pmItem = pmList.querySelector(`[data-pubkey="${pubkey}"]`);

        if (pmItem) {
            // Update the timestamp
            const now = Date.now();
            pmItem.dataset.lastMessageTime = now;

            // Update in memory
            const conversation = this.pmConversations.get(pubkey);
            if (conversation) {
                conversation.lastMessageTime = now;
            }

            // Remove and re-insert in correct order
            pmItem.remove();
            this.insertPMInOrder(pmItem, pmList);
        }
    }

    reorderPMs() {
        const pmList = document.getElementById('pmList');
        const items = Array.from(pmList.querySelectorAll('.pm-item'));

        // Sort by timestamp (most recent first)
        items.sort((a, b) => {
            const timeA = parseInt(a.dataset.lastMessageTime || '0');
            const timeB = parseInt(b.dataset.lastMessageTime || '0');
            return timeB - timeA;
        });

        // Clear and re-append in order
        pmList.innerHTML = '';
        items.forEach(item => pmList.appendChild(item));

        // Re-add/update view more button
        this.updateViewMoreButton('pmList');
    }

    addPMConversation(nym, pubkey, timestamp = Date.now()) {
        if (!this.pmConversations.has(pubkey)) {
            this.pmConversations.set(pubkey, {
                nym: nym,
                lastMessageTime: timestamp
            });

            const pmList = document.getElementById('pmList');
            const item = document.createElement('div');
            item.className = 'pm-item list-item';
            item.dataset.pubkey = pubkey;
            item.dataset.lastMessageTime = timestamp;

            const baseNym = nym.split('#')[0] || nym;
            const suffix = this.getPubkeySuffix(pubkey);
            const formattedNym = `${this.escapeHtml(baseNym)}<span class="nym-suffix">#${suffix}</span>`;

            const verifiedBadge = this.isVerifiedDeveloper(pubkey) ?
                `<span class="verified-badge" title="${this.verifiedDeveloper.title}">✓</span>` : '';

            item.innerHTML = `
    <span class="pm-name">@${formattedNym} ${verifiedBadge}</span>
    <div class="channel-badges">
        <span class="pm-badge">PM</span>
        <span class="delete-pm" onclick="event.stopPropagation(); nym.deletePM('${pubkey}')">✕</span>
        <span class="unread-badge" style="display:none">0</span>
    </div>
`;
            item.onclick = () => this.openPM(nym, pubkey);

            // Insert in chronological order (most recent first)
            this.insertPMInOrder(item, pmList);

            // Update view more button
            this.updateViewMoreButton('pmList');
        }
    }

    insertPMInOrder(newItem, pmList) {
        const newTime = parseInt(newItem.dataset.lastMessageTime);
        const existingItems = Array.from(pmList.querySelectorAll('.pm-item'));
        const viewMoreBtn = pmList.querySelector('.view-more-btn');

        // Find the correct position to insert (most recent first)
        let insertBefore = null;
        for (const item of existingItems) {
            const itemTime = parseInt(item.dataset.lastMessageTime || '0');
            if (newTime > itemTime) {
                insertBefore = item;
                break;
            }
        }

        // If we found a position, insert there
        if (insertBefore) {
            pmList.insertBefore(newItem, insertBefore);
        } else if (viewMoreBtn) {
            // If no position found but there's a view more button, insert before it
            pmList.insertBefore(newItem, viewMoreBtn);
        } else {
            // Otherwise append to the end
            pmList.appendChild(newItem);
        }
    }

    deletePM(pubkey) {
        if (confirm('Delete this PM conversation?')) {
            // Remove from conversations
            this.pmConversations.delete(pubkey);

            // Remove messages
            const conversationKey = this.getPMConversationKey(pubkey);
            this.pmMessages.delete(conversationKey);

            // Remove from UI
            const item = document.querySelector(`[data-pubkey="${pubkey}"]`);
            if (item) item.remove();

            // If currently viewing this PM, switch to bar
            if (this.inPMMode && this.currentPM === pubkey) {
                this.switchChannel('bar', '');
            }

            this.displaySystemMessage('PM conversation deleted');
        }
    }

    openPM(nym, pubkey) {
        this.inPMMode = true;
        this.currentPM = pubkey;
        this.currentChannel = null;
        this.currentGeohash = null;

        // Format the nym with pubkey suffix for display
        const baseNym = nym.split('#')[0] || nym;
        const suffix = this.getPubkeySuffix(pubkey);
        const displayNym = `${baseNym}#${suffix}`;

        // Update UI with formatted nym
        document.getElementById('currentChannel').textContent = `@${displayNym} (PM)`;
        document.getElementById('channelMeta').textContent = 'Private message';

        // Update active states
        document.querySelectorAll('.channel-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelectorAll('.pm-item').forEach(item => {
            item.classList.toggle('active', item.dataset.pubkey === pubkey);
        });

        // Clear unread count
        const conversationKey = this.getPMConversationKey(pubkey);
        this.clearUnreadCount(conversationKey);

        // Load PM messages
        this.loadPMMessages(conversationKey);

        // Close mobile sidebar on mobile
        if (window.innerWidth <= 768) {
            this.closeSidebar();
        }
    }

    loadPMMessages(conversationKey) {
        const container = document.getElementById('messagesContainer');
        container.innerHTML = '';

        const pmMessages = this.pmMessages.get(conversationKey) || [];

        // Only show messages that are part of this specific conversation
        const filteredMessages = pmMessages.filter(msg => {
            // Check if message is from blocked user
            if (this.blockedUsers.has(msg.author) || msg.blocked) {
                return false;
            }

            // Check if message content is spam
            if (this.isSpamMessage(msg.content)) {
                return false;
            }

            // Ensure the message is between the current user and the PM recipient only
            return msg.conversationKey === conversationKey &&
                (msg.pubkey === this.pubkey || msg.pubkey === this.currentPM);
        });

        // Sort messages by timestamp
        filteredMessages.sort((a, b) => a.timestamp - b.timestamp);

        // Display only these filtered messages
        filteredMessages.forEach(msg => {
            // Double-check this is a PM before displaying
            if (msg.isPM && msg.conversationKey === conversationKey) {
                // Use displayMessage to properly handle reactions
                this.displayMessage(msg);
            }
        });

        if (filteredMessages.length === 0) {
            this.displaySystemMessage('Start of private message');
        }

        // Scroll to bottom
        if (this.settings.autoscroll) {
            container.scrollTop = container.scrollHeight;
        }
    }

    openUserPM(nym, pubkey) {
        // Don't open PM with yourself
        if (pubkey === this.pubkey) {
            this.displaySystemMessage("You can't send private messages to yourself");
            return;
        }

        // Extract base nym if it has a suffix
        const baseNym = nym.split('#')[0] || nym;

        // Add to PM conversations if not exists
        this.addPMConversation(baseNym, pubkey);
        // Open the PM
        this.openPM(baseNym, pubkey);
    }

    isMentioned(content) {
        const lowerContent = content.toLowerCase();
        const lowerNym = this.nym.toLowerCase();
        return lowerContent.includes(`@${lowerNym}`) || lowerContent.includes(lowerNym);
    }

    async generateKeypair(suffix) {
        try {
            // Generate ephemeral keys using web worker
            const { privateKey, publicKeyHex } = await this.generateKeypairWorker(suffix);
            
            this.privkey = privateKey;
            this.pubkey = publicKeyHex;

            console.log('Generated ephemeral keypair:');
            console.log(NostrTools.nip19.nsecEncode(privateKey));
            console.log(NostrTools.nip19.npubEncode(publicKeyHex));

            return { privkey: this.privkey, pubkey: this.pubkey };
        } catch (error) {
            console.error('Failed to generate keypair:', error);
            throw error;
        }
    }

    async generateKeypairWorker(targetSuffix) {
        // Create worker
        const worker = new Worker(
            new URL('./workers/profileGenerationWorker.js', import.meta.url),
            { type: 'module' }
        );

        return new Promise((resolve, reject) => {
            // Set up worker message handler
            const handleWorkerMessage = (e) => {
                const { type, data } = e.data;
                
                switch (type) {
                case 'PROFILE_GENERATED': {
                    resolve(data.profile);
                    break;
                }
                    
                // case 'GENERATION_PROGRESS':
                //     // Update progress based on attempts
                //     setProgress(Math.min((data.found / 64) * 100, 99));
                //     break;
                    
                case 'GENERATION_COMPLETE':
                    worker.terminate();
                    break;
                    
                case 'GENERATION_CANCELLED':
                    reject('Profile generation cancelled');
                    break;
                    
                case 'GENERATION_ERROR':
                    reject(data.error || 'Profile generation failed');
                    break;
                }
            };

            worker.onmessage = handleWorkerMessage;

            // Start generation
            worker.postMessage({
                command: 'START_GENERATION',
                data: {
                    username: this.nym,
                    targetSuffix,
                    maxProfiles: 1
                }
            });
        });
    }

    async useExtension() {
        if (!window.nostr) {
            throw new Error('No Nostr extension detected. Please install Alby or nos2x.');
        }

        try {
            const pk = await window.nostr.getPublicKey();
            this.pubkey = pk;
            this.usingExtension = true;

            // Fetch profile from kind 0 event
            await this.fetchProfileFromRelay(pk);

            return { pubkey: pk };
        } catch (error) {
            throw new Error('Failed to connect to Nostr extension');
        }
    }

    async fetchProfileFromRelay(pubkey) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.log('No profile found, using default nym');
                resolve();
            }, 3000);

            const subId = "profile-" + Math.random().toString(36).substring(2);
            const originalHandler = this.handleRelayMessage.bind(this);

            this.handleRelayMessage = (msg) => {
                if (!Array.isArray(msg)) return;

                const [type, ...data] = msg;

                if (type === 'EVENT' && data[0] === subId) {
                    const event = data[1];
                    if (event && event.kind === 0 && event.pubkey === pubkey) {
                        try {
                            const profile = JSON.parse(event.content);

                            // Store complete original profile for non-ephemeral connections
                            if (this.connectionMode !== 'ephemeral') {
                                this.originalProfile = profile;
                                console.log('Stored complete profile with fields:', Object.keys(profile));
                            }

                            // Get name
                            if (profile.name || profile.username || profile.display_name) {
                                const profileName = profile.name || profile.username || profile.display_name;
                                this.nym = profileName.substring(0, 20);
                                document.getElementById('currentNym').textContent = this.nym;
                                console.log('Profile loaded:', this.nym);
                            }

                            // Get lightning address
                            if (pubkey === this.pubkey && (profile.lud16 || profile.lud06)) {
                                const lnAddress = profile.lud16 || profile.lud06;
                                this.lightningAddress = lnAddress;
                                localStorage.setItem(`nym_lightning_address_${this.pubkey}`, lnAddress);
                                this.updateLightningAddressDisplay();
                            }
                        } catch (e) {
                            console.error('Failed to parse profile:', e);
                        }

                        clearTimeout(timeout);
                        this.handleRelayMessage = originalHandler;
                        resolve();
                    }
                } else if (type === 'EOSE' && data[0] === subId) {
                    clearTimeout(timeout);
                    this.handleRelayMessage = originalHandler;
                    resolve();
                }

                originalHandler(msg);
            };

            const subscription = [
                "REQ",
                subId,
                {
                    kinds: [0],
                    authors: [pubkey],
                    limit: 1
                }
            ];

            if (this.connected) {
                this.sendToRelay(subscription);
                setTimeout(() => {
                    this.sendToRelay(["CLOSE", subId]);
                }, 3500);
            } else {
                this.messageQueue.push(JSON.stringify(subscription));
            }
        });
    }

    async publishMessage(content, channel = this.currentChannel, geohash = this.currentGeohash) {
        try {
            if (!this.connected) {
                throw new Error('Not connected to relay');
            }

            const tags = [
                ['n', this.nym], // nym tag
            ];

            let kind;

            // Use appropriate kind and tags based on channel type
            if (geohash) {
                kind = 20000; // Geohash channels use kind 20000
                tags.push(['g', geohash]);
            } else {
                kind = 23333; // Standard channels use kind 23333
                tags.push(['d', channel]);
            }

            const event = {
                kind: kind,
                created_at: Math.floor(Date.now() / 1000),
                tags: tags,
                content: content,
                pubkey: this.pubkey
            };

            // Sign event
            let signedEvent;
            if (window.nostr && !this.privkey) {
                // Use extension
                signedEvent = await window.nostr.signEvent(event);
            } else if (this.privkey) {
                // Use finalizeEvent with ephemeral key
                signedEvent = NostrTools.finalizeEvent(event, this.privkey);
            } else {
                throw new Error('No signing method available');
            }

            // Send to relay
            this.sendToRelay(["EVENT", signedEvent]);

            return true;
        } catch (error) {
            console.error('Failed to publish message:', error);
            this.displaySystemMessage('Failed to send message: ' + error.message);
            return false;
        }
    }

    async createChannel(channelName) {
        try {
            if (!this.connected) {
                throw new Error('Not connected to relay');
            }

            const event = {
                kind: 23333, // Channel creation/joining
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['d', channelName],
                    ['relay', this.relayUrl], // Add relay tag
                ],
                content: JSON.stringify({
                    name: channelName,
                    about: `Channel #${channelName}`,
                    picture: ''
                }),
                pubkey: this.pubkey
            };

            // Sign event
            let signedEvent;
            if (window.nostr && !this.privkey) {
                signedEvent = await window.nostr.signEvent(event);
            } else if (this.privkey) {
                signedEvent = NostrTools.finalizeEvent(event, this.privkey);
            } else {
                throw new Error('No signing method available');
            }

            // Send to relay
            this.sendToRelay(["EVENT", signedEvent]);

            return true;
        } catch (error) {
            console.error('Failed to create channel:', error);
            return false;
        }
    }

    async uploadImage(file) {
        const progress = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('progressFill');

        try {
            progress.classList.add('active');
            progressFill.style.width = '20%';

            // Compute SHA-256 hash
            const arrayBuffer = await file.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            progressFill.style.width = '40%';

            // Create and sign Nostr event
            const uploadEvent = {
                kind: 24242,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['t', 'upload'],
                    ['x', hashHex]
                ],
                content: 'Uploading blob with SHA-256 hash',
                pubkey: this.pubkey
            };

            let signedEvent;
            if (window.nostr && !this.privkey) {
                signedEvent = await window.nostr.signEvent(uploadEvent);
            } else if (this.privkey) {
                signedEvent = NostrTools.finalizeEvent(uploadEvent, this.privkey);
            } else {
                throw new Error('No signing method available');
            }

            progressFill.style.width = '60%';

            // Prepare form data
            const formData = new FormData();
            formData.append('file', file);

            // Convert signed event to base64
            const eventString = JSON.stringify(signedEvent);
            const eventBase64 = btoa(eventString);

            progressFill.style.width = '80%';

            // Upload to nostrmedia.com
            const response = await fetch('https://nostrmedia.com/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Nostr ${eventBase64}`
                },
                body: formData
            });

            progressFill.style.width = '100%';

            if (response.ok) {
                const data = await response.json();
                if (data.url) {
                    const imageUrl = data.url;
                    const input = document.getElementById('messageInput');
                    input.value += imageUrl + ' ';
                    input.focus();
                } else {
                    throw new Error('No URL in response');
                }
            } else {
                throw new Error(`Upload failed: ${response.status}`);
            }
        } catch (error) {
            console.error('Image upload failed:', error);
            this.displaySystemMessage('Failed to upload image: ' + error.message);
        } finally {
            setTimeout(() => {
                progress.classList.remove('active');
            }, 500);
        }
    }

    isDuplicateMessage(message) {
        const displayChannel = message.geohash ? `#${message.geohash}` : message.channel;
        const channelMessages = this.messages.get(displayChannel) || [];
        return channelMessages.some(m =>
            m.id === message.id ||
            (m.content === message.content &&
                m.author === message.author &&
                Math.abs(m.timestamp - message.timestamp) < 2000)
        );
    }

    getNymFromPubkey(pubkey) {
        const user = this.users.get(pubkey);
        if (user) {
            return this.formatNymWithPubkey(user.nym, pubkey);
        }

        // Check PM conversations for saved nyms
        if (this.pmConversations.has(pubkey)) {
            const nym = this.pmConversations.get(pubkey).nym;
            return this.formatNymWithPubkey(nym, pubkey);
        }

        // Return shortened pubkey as fallback with anon prefix
        return `anon#${pubkey.slice(-4)}`;
    }

    displayMessage(message) {
        // Check if message is from a blocked user (from stored state)
        if (message.blocked || this.blockedUsers.has(message.author)) {
            return; // Don't display blocked messages
        }

        // Handle PM messages differently
        if (message.isPM) {
            // Check if we should display this PM now
            if (!this.inPMMode || this.currentPM !== message.conversationPubkey) {
                // Not viewing this PM conversation right now, but message is already stored
                return;
            }

            // Don't display if it's not part of the current conversation
            const currentConversationKey = this.getPMConversationKey(this.currentPM);
            if (message.conversationKey !== currentConversationKey) {
                return;
            }
        } else {
            // Regular channel message
            if (this.inPMMode) {
                // In PM mode, don't display channel messages
                return;
            }

            const storageKey = message.geohash ? `#${message.geohash}` : message.channel;

            // Store message if not already exists
            if (!this.messages.has(storageKey)) {
                this.messages.set(storageKey, []);
            }

            // Check if message already exists
            const exists = this.messages.get(storageKey).some(m => m.id === message.id);
            if (!exists) {
                // Add message and sort by timestamp with millisecond precision
                this.messages.get(storageKey).push(message);
                this.messages.get(storageKey).sort((a, b) => {
                    return a.timestamp.getTime() - b.timestamp.getTime();
                });

                // Prune messages if exceeding limit (1000 max)
                const messages = this.messages.get(storageKey);
                if (messages.length > 10000) {
                    // Keep only the most recent 10,000 messages
                    this.messages.set(storageKey, messages.slice(-1000));
                    console.log(`Pruned messages in ${storageKey} to 1000 max`);
                }
            }

            // Check if this is for current channel
            const currentKey = this.currentGeohash ? `#${this.currentGeohash}` : this.currentChannel;
            if (storageKey !== currentKey) {
                // Message is for different channel, update unread count but don't display
                if (!message.isOwn && !exists && !message.isHistorical) {
                    this.updateUnreadCount(storageKey);
                }
                return;
            }
        }

        // Don't re-add if already displayed in DOM
        if (document.querySelector(`[data-message-id="${message.id}"]`)) {
            return;
        }

        // Now actually display the message in the DOM
        const container = document.getElementById('messagesContainer');
        const shouldScroll = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;

        const time = this.settings.showTimestamps ?
            message.timestamp.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }) : '';

        const messageEl = document.createElement('div');

        // Check if nym is blocked or message contains blocked keywords or is spam
        if (this.blockedUsers.has(message.author) ||
            this.hasBlockedKeyword(message.content) ||
            this.isSpamMessage(message.content)) {
            // Don't create the element at all for blocked/spam content
            return;
        }

        // Check if nym is flooding in THIS CHANNEL (but not for PMs and not for historical messages)
        const channelToCheck = message.geohash || message.channel;
        if (!message.isPM && !message.isHistorical && this.isFlooding(message.pubkey, channelToCheck)) {
            messageEl.className = 'message flooded';
        }

        // Check if message mentions the user
        const isMentioned = !message.isOwn && this.isMentioned(message.content);

        // Check for action messages
        if (message.content.startsWith('/me ')) {
            messageEl.className = 'action-message';
            messageEl.innerHTML = `* ${this.escapeHtml(message.author)} ${this.formatMessage(message.content.substring(4))}`;
        } else {
            const classes = ['message'];

            if (message.isOwn) {
                classes.push('self');
            } else if (message.isPM) {
                classes.push('pm');
            } else if (isMentioned) {
                classes.push('mentioned');
            }

            messageEl.className = classes.join(' ');
            messageEl.dataset.messageId = message.id;
            messageEl.dataset.author = message.author;
            messageEl.dataset.pubkey = message.pubkey;
            messageEl.dataset.timestamp = message.timestamp.getTime();

            const authorClass = message.isOwn ? 'self' : '';
            const userColorClass = this.getUserColorClass(message.pubkey);

            // Add verified badge if this is the developer
            const verifiedBadge = this.isVerifiedDeveloper(message.pubkey) ?
                `<span class="verified-badge" title="${this.verifiedDeveloper.title}">✓</span>` : '';

            // Check if this is a valid event ID (not temporary PM ID)
            const isValidEventId = message.id && /^[0-9a-f]{64}$/i.test(message.id);
            const isMobile = window.innerWidth <= 768;

            // Show reaction button for all messages with valid IDs (including PMs)
            const reactionButton = isValidEventId && !isMobile ? `
<button class="reaction-btn" onclick="nym.showReactionPicker('${message.id}', this)">
    <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
        <circle cx="9" cy="9" r="1"></circle>
        <circle cx="15" cy="9" r="1"></circle>
    </svg>
</button>
` : '';

            // Build the initial HTML with quote detection
            const formattedContent = this.formatMessageWithQuotes(message.content);

            const baseNym = message.author.split('#')[0] || message.author;
            const displayAuthor = `${this.escapeHtml(baseNym)}<span class="nym-suffix">#${this.getPubkeySuffix(message.pubkey)}</span>`;
            const escapedAuthorBase = this.escapeHtml(message.author).split('#')[0] || this.escapeHtml(message.author);
            const authorWithHtml = `${escapedAuthorBase}<span class="nym-suffix">#${this.getPubkeySuffix(message.pubkey)}</span>`;

            messageEl.innerHTML = `
    ${time ? `<span class="message-time">${time}</span>` : ''}
    <span class="message-author ${authorClass} ${userColorClass}">${displayAuthor}${verifiedBadge}:</span>
    <span class="message-content ${userColorClass}">${formattedContent}</span>
    ${reactionButton}
`;

            const authorSpan = messageEl.querySelector('.message-author');
            if (authorSpan) {
                authorSpan.style.cursor = 'pointer';
                authorSpan.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showContextMenu(e, displayAuthor, message.pubkey, message.content, message.id);
                    return false;
                });
            }
        }

        // Find the correct position to insert the message based on timestamp
        const existingMessages = Array.from(container.querySelectorAll('.message[data-timestamp]'));
        const messageTimestamp = message.timestamp.getTime();

        let insertBefore = null;
        for (const existing of existingMessages) {
            const existingTimestamp = parseInt(existing.dataset.timestamp);
            if (messageTimestamp < existingTimestamp) {
                insertBefore = existing;
                break;
            }
        }

        if (insertBefore) {
            container.insertBefore(messageEl, insertBefore);
        } else {
            const typingIndicator = container.querySelector('.typing-indicator');
            if (typingIndicator) {
                container.insertBefore(messageEl, typingIndicator);
            } else {
                container.appendChild(messageEl);
            }
        }

        // Add existing reactions if any (for both channel messages and PMs)
        if (message.id && this.reactions.has(message.id)) {
            this.updateMessageReactions(message.id);
        }

        // Add zaps display - check if this message has any zaps
        if (message.id && this.zaps.has(message.id)) {
            this.updateMessageZaps(message.id);
        }

        if (shouldScroll && this.settings.autoscroll) {
            container.scrollTop = container.scrollHeight;
        }
    }

    pruneChannelMessages(channelKey, maxMessages = 1000) {
        const messages = this.messages.get(channelKey);
        if (!messages || messages.length <= maxMessages) return;

        // Keep only the most recent messages
        const prunedMessages = messages.slice(-maxMessages);
        this.messages.set(channelKey, prunedMessages);

        // If currently viewing this channel, refresh the display
        const currentKey = this.currentGeohash ? `#${this.currentGeohash}` : this.currentChannel;
        if (currentKey === channelKey) {
            this.loadChannelMessages(channelKey);
        }
    }

    formatMessageWithQuotes(content) {
        // Check if message starts with a quote (> @username: text)
        const quoteMatch = content.match(/^>\s*@(\w+):\s*(.+?)(?:\n|$)/);

        if (quoteMatch) {
            const quotedUser = quoteMatch[1];
            const quotedText = quoteMatch[2];
            const remainingContent = content.substring(quoteMatch[0].length).trim();

            // Check if the quoted text might be ASCII art
            const quotedLines = quotedText.split('\n');
            const isAsciiArt = quotedLines.some(line => {
                const specialCharCount = (line.match(/[^\w\s]/g) || []).length;
                return specialCharCount > 5 && line.length > 10;
            });

            if (isAsciiArt) {
                // Preserve ASCII art in quotes
                let html = `<div class="message-quote">@${this.escapeHtml(quotedUser)}: <pre style="margin: 5px 0; font-family: var(--font-mono);">${this.escapeHtml(quotedText)}</pre></div>`;
                if (remainingContent) {
                    html += this.formatMessage(remainingContent);
                }
                return html;
            } else {
                let html = `<div class="message-quote">@${this.escapeHtml(quotedUser)}: ${this.escapeHtml(quotedText)}</div>`;
                if (remainingContent) {
                    html += this.formatMessage(remainingContent);
                }
                return html;
            }
        }

        return this.formatMessage(content);
    }

    closeReactionPickerHandler(e) {
        if (this.activeReactionPicker && !this.activeReactionPicker.contains(e.target)) {
            this.closeReactionPicker();
        }
    }

    closeReactionPicker() {
        if (this.activeReactionPicker) {
            this.activeReactionPicker.remove();
            this.activeReactionPicker = null;
            this.activeReactionPickerButton = null;
        }
    }

    currentDisplayChannel() {
        // Return consistent key format for message storage
        return this.currentGeohash ? `#${this.currentGeohash}` : this.currentChannel;
    }

    formatMessage(content) {
        let formatted = content;

        // First, escape HTML entities
        formatted = formatted.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        // Code blocks with proper line break handling
        formatted = formatted.replace(/```([\s\S]*?)```/g, (match, code) => {
            // Preserve line breaks in code blocks
            const formattedCode = code.trim().replace(/\n/g, '<br>');
            return `<pre><code>${formattedCode}</code></pre>`;
        });

        // Bold **text** or __text__
        formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/__(.+?)__/g, '<strong>$1</strong>');

        // Italic *text* or _text_ (avoid URLs and code blocks)
        formatted = formatted.replace(/(?<![:/])(\*|_)([^*_\s][^*_]*)\1/g, '<em>$2</em>');

        // Strikethrough ~~text~~
        formatted = formatted.replace(/~~(.+?)~~/g, '<del>$1</del>');

        // Blockquotes > text
        formatted = formatted.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

        // Headers
        formatted = formatted.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        formatted = formatted.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        formatted = formatted.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // Convert image URLs to images
        formatted = formatted.replace(
            /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)(\?[^\s]*)?)/gi,
            '<img src="$1" alt="Image" onclick="nym.expandImage(\'$1\')" />'
        );

        // Convert other URLs to links (but not placeholders)
        formatted = formatted.replace(
            /(https?:\/\/[^\s]+)(?![^<]*>)(?!__)/g,
            '<a href="$1" target="_blank" rel="noopener">$1</a>'
        );

        // Process mentions and channels together in one pass
        formatted = formatted.replace(
            /(@[^@#\n]*?#[0-9a-f]{4}\b)|(@[^@\s][^@\s]*)|(?:^|\s)(#\w+)(?=\s|$)/gi,
            (match, mentionWithSuffix, simpleMention, channel, offset) => {
                if (mentionWithSuffix) {
                    // This is a mention with a pubkey suffix
                    return `<span style="color: var(--secondary)">${mentionWithSuffix}</span>`;
                } else if (simpleMention) {
                    // This is a simple mention without spaces or suffix
                    return `<span style="color: var(--secondary)">${simpleMention}</span>`;
                } else if (channel) {
                    // This is a channel reference
                    const channelName = channel.substring(1); // Remove the #
                    const type = this.getChannelType(channelName);
                    const badge = type === 'geo' ? ' [GEO]' : ' [STD]';
                    const space = match.startsWith(' ') ? ' ' : '';
                    return `${space}<span class="channel-link" onclick="nym.quickJoinChannel('${channelName}')">#${channelName}${badge}</span>`;
                }
                return match;
            }
        );

        return formatted;
    }

    expandImage(src) {
        document.getElementById('modalImage').src = src;
        document.getElementById('imageModal').classList.add('active');
    }

    quickJoinChannel(channel) {
        const type = this.getChannelType(channel);

        if (type === 'geo') {
            this.addChannel(channel, channel);
            this.switchChannel(channel, channel);
            this.userJoinedChannels.add(channel); // Mark as user-joined
        } else {
            this.addChannel(channel, '');
            this.switchChannel(channel, '');
            // Also create the channel with kind 23333
            this.createChannel(channel);
            this.userJoinedChannels.add(channel); // Mark as user-joined
        }

        // Save after quick join
        this.saveUserChannels();
    }

    insertMention(nym) {
        const input = document.getElementById('messageInput');
        const currentValue = input.value;
        const mention = `@${nym} `;

        // Insert at cursor position or append
        const start = input.selectionStart;
        const end = input.selectionEnd;

        if (start !== undefined) {
            input.value = currentValue.substring(0, start) + mention + currentValue.substring(end);
            input.selectionStart = input.selectionEnd = start + mention.length;
        } else {
            input.value = currentValue + mention;
        }

        input.focus();
    }

    displaySystemMessage(content, type = 'system') {
        const container = document.getElementById('messagesContainer');
        const messageEl = document.createElement('div');
        messageEl.className = type === 'action' ? 'action-message' : 'system-message';
        messageEl.innerHTML = content;
        container.appendChild(messageEl);

        if (this.settings.autoscroll) {
            container.scrollTop = container.scrollHeight;
        }
    }

    updateUserPresence(nym, pubkey, channel, geohash) {
        const channelKey = geohash || channel;

        // Update or create user with deduplication by pubkey
        if (!this.users.has(pubkey)) {
            this.users.set(pubkey, {
                nym: nym,
                pubkey: pubkey,
                lastSeen: Date.now(),
                status: this.awayMessages.has(pubkey) ? 'away' : 'online',
                channels: new Set([channelKey])
            });
        } else {
            const user = this.users.get(pubkey);
            user.lastSeen = Date.now();
            user.nym = nym; // Update nym in case it changed
            user.channels.add(channelKey);
            user.status = this.awayMessages.has(pubkey) ? 'away' : 'online';
        }

        // Track users per channel
        if (!this.channelUsers.has(channelKey)) {
            this.channelUsers.set(channelKey, new Set());
        }
        this.channelUsers.get(channelKey).add(pubkey);

        this.updateUserList();
    }

    updateUserList() {
        const userListContent = document.getElementById('userListContent');
        const currentChannelKey = this.currentGeohash || this.currentChannel;

        // Get deduplicated active users (one entry per pubkey)
        const uniqueUsers = new Map();
        this.users.forEach((user, pubkey) => {
            if (Date.now() - user.lastSeen < 300000 && !this.blockedUsers.has(user.nym)) {
                // Only add if not already there (deduplication by pubkey)
                if (!uniqueUsers.has(pubkey)) {
                    uniqueUsers.set(pubkey, user);
                }
            }
        });

        const allUsers = Array.from(uniqueUsers.values())
            .filter(user => user && user.nym) // Ensure user and nym exist
            .sort((a, b) => {
                const nymA = String(a.nym || '');
                const nymB = String(b.nym || '');
                return nymA.localeCompare(nymB);
            });

        // Filter users based on search term
        let displayUsers = allUsers;
        if (this.userSearchTerm) {
            displayUsers = allUsers.filter(user =>
                user.nym.toLowerCase().includes(this.userSearchTerm.toLowerCase())
            );
        }

        // Get users in current channel for the count
        const channelUserSet = this.channelUsers.get(currentChannelKey) || new Set();
        const channelUserCount = Array.from(channelUserSet)
            .filter(pubkey => {
                const user = this.users.get(pubkey);
                return user && Date.now() - user.lastSeen < 300000 && !this.blockedUsers.has(user.nym);
            }).length;

        // Display deduplicated users in sidebar with click to open PM and right-click for context menu
        userListContent.innerHTML = displayUsers.map((user, index) => {
            const baseNym = user.nym.split('#')[0] || user.nym;
            const suffix = this.getPubkeySuffix(user.pubkey);
            const displayNym = `${this.escapeHtml(baseNym)}<span class="nym-suffix">#${suffix}</span>`;
            const verifiedBadge = this.isVerifiedDeveloper(user.pubkey) ?
                `<span class="verified-badge" title="${this.verifiedDeveloper.title}" style="margin-left: 3px;">✓</span>` : '';

            // Apply color to user list items in Bitchat theme
            const userColorClass = this.settings.theme === 'bitchat' ? this.getUserColorClass(user.pubkey) : '';

            return `
        <div class="user-item list-item ${userColorClass}" 
                onclick="nym.openUserPM('${this.escapeHtml(user.nym)}', '${user.pubkey}')" 
                oncontextmenu="nym.showContextMenu(event, '${this.escapeHtml(user.nym)}', '${user.pubkey}')"
                data-nym="${this.escapeHtml(displayNym)}">
            <span class="user-status ${user.status}"></span>
            <span class="${userColorClass}">${displayNym} ${verifiedBadge}</span>
        </div>
    `;
        }).join('');

        // Add view more button for users
        this.updateViewMoreButton('userListContent');

        // Update active nyms count in title
        const userListTitle = document.querySelector('#userList .nav-title-text');
        if (userListTitle) {
            userListTitle.textContent = `Active Nyms (${allUsers.length})`;
        }

        // Update channel meta with channel-specific count
        if (!this.inPMMode) {
            document.getElementById('channelMeta').textContent = `${channelUserCount} online nyms`;
        }
    }

    filterChannels(searchTerm) {
        const items = document.querySelectorAll('.channel-item');
        const term = searchTerm.toLowerCase();
        const list = document.getElementById('channelList');

        items.forEach(item => {
            const channelName = item.querySelector('.channel-name').textContent.toLowerCase();
            if (term.length === 0 || channelName.includes(term)) {
                item.style.display = 'flex';
                item.classList.remove('search-hidden');
            } else {
                item.style.display = 'none';
                item.classList.add('search-hidden');
            }
        });

        // Hide view more button during search
        const viewMoreBtn = list.querySelector('.view-more-btn');
        if (viewMoreBtn) {
            viewMoreBtn.style.display = term ? 'none' : 'block';
        }
    }

    filterPMs(searchTerm) {
        const items = document.querySelectorAll('.pm-item');
        const term = searchTerm.toLowerCase();
        const list = document.getElementById('pmList');

        items.forEach(item => {
            const pmName = item.querySelector('.pm-name').textContent.toLowerCase();
            if (term.length === 0 || pmName.includes(term)) {
                item.style.display = 'flex';
                item.classList.remove('search-hidden');
            } else {
                item.style.display = 'none';
                item.classList.add('search-hidden');
            }
        });

        // Hide view more button during search
        const viewMoreBtn = list.querySelector('.view-more-btn');
        if (viewMoreBtn) {
            viewMoreBtn.style.display = term ? 'none' : 'block';
        }
    }

    filterUsers(searchTerm) {
        this.userSearchTerm = searchTerm;
        this.updateUserList();

        const list = document.getElementById('userListContent');

        // Hide view more button during search
        const viewMoreBtn = list.querySelector('.view-more-btn');
        if (viewMoreBtn) {
            viewMoreBtn.style.display = searchTerm ? 'none' : 'block';
        }
    }

    togglePin(channel, geohash) {
        // Don't allow pinning/unpinning #bar since it's always at top
        if (channel === 'bar' && !geohash) {
            this.displaySystemMessage('#bar is always at the top');
            return;
        }

        const key = geohash || channel;

        if (this.pinnedChannels.has(key)) {
            this.pinnedChannels.delete(key);
        } else {
            this.pinnedChannels.add(key);
        }

        this.savePinnedChannels();
        this.updateChannelPins();

        // Save to synced settings for persistent connections
        if (this.connectionMode !== 'ephemeral') {
            this.saveSyncedSettings();
        }
    }

    updateChannelPins() {
        document.querySelectorAll('.channel-item').forEach(item => {
            const channel = item.dataset.channel;
            const geohash = item.dataset.geohash;
            const key = geohash || channel;
            const pinBtn = item.querySelector('.pin-btn');

            if (this.pinnedChannels.has(key)) {
                item.classList.add('pinned');
                if (pinBtn) pinBtn.classList.add('pinned');
            } else {
                item.classList.remove('pinned');
                if (pinBtn) pinBtn.classList.remove('pinned');
            }
        });
    }

    savePinnedChannels() {
        localStorage.setItem('nym_pinned_channels', JSON.stringify(Array.from(this.pinnedChannels)));
    }

    loadPinnedChannels() {
        const saved = localStorage.getItem('nym_pinned_channels');
        if (saved) {
            this.pinnedChannels = new Set(JSON.parse(saved));
            this.updateChannelPins();
        }
    }

    setupEventListeners() {
        const input = document.getElementById('messageInput');

        input.addEventListener('keydown', (e) => {
            const autocomplete = document.getElementById('autocompleteDropdown');
            const emojiAutocomplete = document.getElementById('emojiAutocomplete');
            const commandPalette = document.getElementById('commandPalette');

            if (autocomplete.classList.contains('active')) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.navigateAutocomplete(1);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.navigateAutocomplete(-1);
                } else if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    this.selectAutocomplete();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.hideAutocomplete();
                }
            } else if (emojiAutocomplete.classList.contains('active')) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.navigateEmojiAutocomplete(1);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.navigateEmojiAutocomplete(-1);
                } else if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    this.selectEmojiAutocomplete();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.hideEmojiAutocomplete();
                }
            } else if (commandPalette.classList.contains('active')) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.navigateCommandPalette(1);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.navigateCommandPalette(-1);
                } else if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    this.selectCommand();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.hideCommandPalette();
                }
            } else {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                } else if (e.key === 'ArrowUp' && input.value === '') {
                    e.preventDefault();
                    this.navigateHistory(-1);
                } else if (e.key === 'ArrowDown' && input.value === '') {
                    e.preventDefault();
                    this.navigateHistory(1);
                }
            }
        });

        input.addEventListener('input', (e) => {
            this.handleInputChange(e.target.value);
            this.autoResizeTextarea(e.target);
        });

        // Use event delegation for channel clicks
        document.getElementById('channelList').addEventListener('click', (e) => {
            // Handle channel item clicks
            const channelItem = e.target.closest('.channel-item');
            if (channelItem && !e.target.closest('.pin-btn')) {
                e.preventDefault();
                e.stopPropagation();

                const channel = channelItem.dataset.channel;
                const geohash = channelItem.dataset.geohash || '';

                // Don't reload if already in channel
                if (!this.inPMMode && channel === this.currentChannel && geohash === this.currentGeohash) {
                    return;
                }

                // Add debounce to prevent double-clicks
                if (channelItem.dataset.clicking === 'true') return;
                channelItem.dataset.clicking = 'true';

                this.switchChannel(channel, geohash);

                // Reset click flag after a short delay
                setTimeout(() => {
                    delete channelItem.dataset.clicking;
                }, 1000);
            }
        });

        // Global click handler for closing dropdowns and modals
        document.addEventListener('click', (e) => {
            // Close command palette if clicking outside
            if (!e.target.closest('#commandPalette') && !e.target.closest('#messageInput')) {
                this.hideCommandPalette();
            }

            // Close emoji autocomplete if clicking outside
            if (!e.target.closest('#emojiAutocomplete') && !e.target.closest('#messageInput')) {
                this.hideEmojiAutocomplete();
            }

            // Close @ mention autocomplete if clicking outside
            if (!e.target.closest('#autocompleteDropdown') && !e.target.closest('#messageInput')) {
                this.hideAutocomplete();
            }

            // Close enhanced emoji modal if clicking outside
            if (!e.target.closest('.enhanced-emoji-modal') &&
                !e.target.closest('.reaction-btn') &&
                !e.target.closest('.add-reaction-btn') &&
                !e.target.closest('.icon-btn.input-btn[title="Emoji"]') &&
                !e.target.closest('#ctxReact')) {
                this.closeEnhancedEmojiModal();
            }

            // Handle command palette item click
            if (e.target.closest('.command-item')) {
                this.selectCommand(e.target.closest('.command-item'));
            }
        });

        // File input
        document.getElementById('fileInput').addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                this.uploadImage(e.target.files[0]);
            }
        });

        // Modal controls
        document.getElementById('channelTypeSelect').addEventListener('change', (e) => {
            document.getElementById('standardChannelGroup').style.display =
                e.target.value === 'standard' ? 'block' : 'none';
            document.getElementById('geohashGroup').style.display =
                e.target.value === 'geohash' ? 'block' : 'none';
        });
    }

    setupCommands() {
        this.commands = {
            '/help': { desc: 'Show available commands', fn: () => this.showHelp() },
            '/join': { desc: 'Join a channel', fn: (args) => this.cmdJoin(args) },
            '/j': { desc: 'Shortcut for /join', fn: (args) => this.cmdJoin(args) },
            '/pm': { desc: 'Send private message', fn: (args) => this.cmdPM(args) },
            '/nick': { desc: 'Change your nym', fn: (args) => this.cmdNick(args) },
            '/who': { desc: 'List online nyms', fn: () => this.cmdWho() },
            '/w': { desc: 'Shortcut for /who', fn: () => this.cmdWho() },
            '/clear': { desc: 'Clear chat messages', fn: () => this.cmdClear() },
            '/block': { desc: 'Block a user or #channel', fn: (args) => this.cmdBlock(args) },
            '/unblock': { desc: 'Unblock a user', fn: (args) => this.cmdUnblock(args) },
            '/slap': { desc: 'Slap someone with a trout', fn: (args) => this.cmdSlap(args) },
            '/me': { desc: 'Action message', fn: (args) => this.cmdMe(args) },
            '/shrug': { desc: 'Send a shrug', fn: () => this.cmdShrug() },
            '/bold': { desc: 'Send bold text (**text**)', fn: (args) => this.cmdBold(args) },
            '/b': { desc: 'Shortcut for /bold', fn: (args) => this.cmdBold(args) },
            '/italic': { desc: 'Send italic text (*text*)', fn: (args) => this.cmdItalic(args) },
            '/i': { desc: 'Shortcut for /italic', fn: (args) => this.cmdItalic(args) },
            '/strike': { desc: 'Send strikethrough text (~~text~~)', fn: (args) => this.cmdStrike(args) },
            '/s': { desc: 'Shortcut for /strike', fn: (args) => this.cmdStrike(args) },
            '/code': { desc: 'Send code block', fn: (args) => this.cmdCode(args) },
            '/c': { desc: 'Shortcut for /code', fn: (args) => this.cmdCode(args) },
            '/quote': { desc: 'Send quoted text', fn: (args) => this.cmdQuote(args) },
            '/q': { desc: 'Shortcut for /quote', fn: (args) => this.cmdQuote(args) },
            '/brb': { desc: 'Set away message', fn: (args) => this.cmdBRB(args) },
            '/back': { desc: 'Clear away message', fn: () => this.cmdBack() },
            '/zap': { desc: 'Zap a user profile', fn: (args) => this.cmdZap(args) },
            '/invite': { desc: 'Invite a user to current channel', fn: (args) => this.cmdInvite(args) },
            '/share': { desc: 'Share current channel URL', fn: () => this.cmdShare() },
            '/leave': { desc: 'Leave current channel', fn: () => this.cmdLeave() },
            '/quit': { desc: 'Disconnect from NYM', fn: () => this.cmdQuit() }
        };
    }

    handleInputChange(value) {
        // Check for emoji autocomplete with :
        const colonIndex = value.lastIndexOf(':');
        if (colonIndex !== -1 && colonIndex === value.length - 1 ||
            (colonIndex !== -1 && value.substring(colonIndex).match(/^:[a-z]*$/))) {
            const search = value.substring(colonIndex + 1);
            this.showEmojiAutocomplete(search);
        } else {
            this.hideEmojiAutocomplete();
        }

        // Check for @ mentions
        const lastAtIndex = value.lastIndexOf('@');
        if (lastAtIndex !== -1 && lastAtIndex === value.length - 1 ||
            (lastAtIndex !== -1 && value.substring(lastAtIndex).match(/^@\w*$/))) {
            const search = value.substring(lastAtIndex + 1);
            this.showAutocomplete(search);
        } else {
            this.hideAutocomplete();
        }

        // Check for commands
        if (value.startsWith('/')) {
            this.showCommandPalette(value);
        } else {
            this.hideCommandPalette();
        }
    }

    showEmojiAutocomplete(search) {
        const dropdown = document.getElementById('emojiAutocomplete');

        // Build complete emoji list from all categories
        const allEmojiEntries = [];

        // Add emoji shortcodes
        Object.entries(this.emojiMap).forEach(([name, emoji]) => {
            allEmojiEntries.push({ name, emoji, priority: 1 });
        });

        // Add all categorized emojis with searchable names
        Object.entries(this.allEmojis).forEach(([category, emojis]) => {
            emojis.forEach(emoji => {
                // Try to find a name for this emoji in emojiMap
                const existingEntry = allEmojiEntries.find(e => e.emoji === emoji);
                if (!existingEntry) {
                    // Generate a searchable name from the emoji itself
                    allEmojiEntries.push({
                        name: emoji,
                        emoji,
                        priority: 2
                    });
                }
            });
        });

        // Filter based on search
        let matches = [];
        if (search === '') {
            // Show recent emojis first, then common ones
            const recentSet = new Set(this.recentEmojis);
            matches = [
                ...this.recentEmojis.map(emoji => ({
                    name: Object.entries(this.emojiMap).find(([n, e]) => e === emoji)?.[0] || emoji,
                    emoji
                })),
                ...allEmojiEntries.filter(e => !recentSet.has(e.emoji)).slice(0, 10)
            ].slice(0, 8);
        } else {
            matches = allEmojiEntries
                .filter(entry =>
                    entry.name.toLowerCase().includes(search.toLowerCase()) ||
                    entry.emoji.includes(search)
                )
                .sort((a, b) => a.priority - b.priority)
                .slice(0, 8);
        }

        if (matches.length > 0) {
            dropdown.innerHTML = matches.map(({ name, emoji }, index) => `
                <div class="emoji-item ${index === 0 ? 'selected' : ''}" data-name="${name}" data-emoji="${emoji}">
                    <span class="emoji-item-emoji">${emoji}</span>
                    <span class="emoji-item-name">:${name}:</span>
                </div>
            `).join('');
            dropdown.classList.add('active');
            this.emojiAutocompleteIndex = 0;

            // Add click handlers for each emoji item
            dropdown.querySelectorAll('.emoji-item').forEach((item, index) => {
                item.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.emojiAutocompleteIndex = index;
                    // Remove selected from all, add to clicked
                    dropdown.querySelectorAll('.emoji-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    this.selectEmojiAutocomplete();
                };
            });
        } else {
            this.hideEmojiAutocomplete();
        }
    }

    hideEmojiAutocomplete() {
        document.getElementById('emojiAutocomplete').classList.remove('active');
        this.emojiAutocompleteIndex = -1;
    }

    navigateEmojiAutocomplete(direction) {
        const items = document.querySelectorAll('.emoji-item');
        if (items.length === 0) return;

        items[this.emojiAutocompleteIndex]?.classList.remove('selected');

        this.emojiAutocompleteIndex += direction;
        if (this.emojiAutocompleteIndex < 0) this.emojiAutocompleteIndex = items.length - 1;
        if (this.emojiAutocompleteIndex >= items.length) this.emojiAutocompleteIndex = 0;

        items[this.emojiAutocompleteIndex].classList.add('selected');
        items[this.emojiAutocompleteIndex].scrollIntoView({ block: 'nearest' });
    }

    selectEmojiAutocomplete() {
        const selected = document.querySelector('.emoji-item.selected');
        if (selected) {
            const emoji = selected.dataset.emoji;
            const input = document.getElementById('messageInput');
            const value = input.value;
            const colonIndex = value.lastIndexOf(':');

            input.value = value.substring(0, colonIndex) + emoji + ' ';
            input.focus();
            this.hideEmojiAutocomplete();
            this.addToRecentEmojis(emoji);
        }
    }

    showAutocomplete(search) {
        const dropdown = document.getElementById('autocompleteDropdown');

        // Get current time for activity check
        const now = Date.now();
        const activeThreshold = 300000; // 5 minutes

        // Collect and categorize users
        const onlineUsers = [];
        const offlineUsers = [];

        this.users.forEach((user, pubkey) => {
            // Create formatted nym for matching
            const baseNym = user.nym.split('#')[0] || user.nym;
            const suffix = this.getPubkeySuffix(pubkey);
            const searchableNym = `${baseNym}#${suffix}`;

            if (!this.blockedUsers.has(user.nym) &&
                searchableNym.toLowerCase().includes(search.toLowerCase())) {

                // Create HTML version for display
                const displayNym = `${this.escapeHtml(baseNym)}<span class="nym-suffix">#${suffix}</span>`;

                const userEntry = {
                    nym: user.nym,
                    pubkey: pubkey,
                    displayNym: displayNym,
                    searchableNym: searchableNym,
                    lastSeen: user.lastSeen
                };

                if (now - user.lastSeen < activeThreshold) {
                    onlineUsers.push(userEntry);
                } else {
                    offlineUsers.push(userEntry);
                }
            }
        });

        // Sort each group alphabetically by searchable name
        onlineUsers.sort((a, b) => a.searchableNym.localeCompare(b.searchableNym));
        offlineUsers.sort((a, b) => a.searchableNym.localeCompare(b.searchableNym));

        // Combine with online users first
        const allUsers = [...onlineUsers, ...offlineUsers].slice(0, 8);

        if (allUsers.length > 0) {
            dropdown.innerHTML = allUsers.map((user, index) => {
                const isOnline = now - user.lastSeen < activeThreshold;
                const statusIndicator = isOnline ?
                    '<span style="color: var(--primary); margin-right: 5px;">●</span>' :
                    '<span style="color: var(--text-dim); margin-right: 5px;">○</span>';

                return `
        <div class="autocomplete-item ${index === 0 ? 'selected' : ''}" 
                data-nym="${user.nym}"
                data-pubkey="${user.pubkey}"
                onclick="nym.selectSpecificAutocomplete('${user.nym}', '${user.pubkey}')">
            ${statusIndicator}<strong>@${user.displayNym}</strong>
        </div>
    `;
            }).join('');
            dropdown.classList.add('active');
            this.autocompleteIndex = 0;

            // Add click handlers
            dropdown.querySelectorAll('.autocomplete-item').forEach((item, index) => {
                item.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.autocompleteIndex = index;
                    dropdown.querySelectorAll('.autocomplete-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    this.selectAutocomplete();
                };
            });
        } else {
            this.hideAutocomplete();
        }
    }

    selectSpecificAutocomplete(nym, pubkey) {
        const input = document.getElementById('messageInput');
        const value = input.value;
        const lastAtIndex = value.lastIndexOf('@');

        // Use just the base nym without suffix in the message
        input.value = value.substring(0, lastAtIndex) + '@' + nym + ' ';
        input.focus();
        this.hideAutocomplete();
    }

    hideAutocomplete() {
        document.getElementById('autocompleteDropdown').classList.remove('active');
        this.autocompleteIndex = -1;
    }

    navigateAutocomplete(direction) {
        const items = document.querySelectorAll('.autocomplete-item');
        if (items.length === 0) return;

        items[this.autocompleteIndex]?.classList.remove('selected');

        this.autocompleteIndex += direction;
        if (this.autocompleteIndex < 0) this.autocompleteIndex = items.length - 1;
        if (this.autocompleteIndex >= items.length) this.autocompleteIndex = 0;

        items[this.autocompleteIndex].classList.add('selected');
        items[this.autocompleteIndex].scrollIntoView({ block: 'nearest' });
    }

    selectAutocomplete() {
        const selected = document.querySelector('.autocomplete-item.selected');
        if (selected) {
            const nym = selected.dataset.nym;
            const pubkey = selected.dataset.pubkey;
            const input = document.getElementById('messageInput');
            const value = input.value;
            const lastAtIndex = value.lastIndexOf('@');

            // Use base nym with suffix
            const baseNym = nym.split('#')[0] || nym;
            const suffix = this.getPubkeySuffix(pubkey);
            input.value = value.substring(0, lastAtIndex) + '@' + baseNym + '#' + suffix + ' ';
            input.focus();
            this.hideAutocomplete();
        }
    }

    showCommandPalette(input) {
        const palette = document.getElementById('commandPalette');
        const matchingCommands = Object.entries(this.commands)
            .filter(([cmd]) => cmd.startsWith(input.toLowerCase()));

        if (matchingCommands.length > 0) {
            palette.innerHTML = matchingCommands.map(([cmd, info], index) => `
                <div class="command-item ${index === 0 ? 'selected' : ''}" data-command="${cmd}">
                    <span class="command-name">${cmd}</span>
                    <span class="command-desc">${info.desc}</span>
                </div>
            `).join('');
            palette.classList.add('active');
            this.commandPaletteIndex = 0;
        } else {
            this.hideCommandPalette();
        }
    }

    hideCommandPalette() {
        document.getElementById('commandPalette').classList.remove('active');
        this.commandPaletteIndex = -1;
    }

    navigateCommandPalette(direction) {
        const items = document.querySelectorAll('.command-item');
        if (items.length === 0) return;

        items[this.commandPaletteIndex]?.classList.remove('selected');

        this.commandPaletteIndex += direction;
        if (this.commandPaletteIndex < 0) this.commandPaletteIndex = items.length - 1;
        if (this.commandPaletteIndex >= items.length) this.commandPaletteIndex = 0;

        items[this.commandPaletteIndex].classList.add('selected');
        items[this.commandPaletteIndex].scrollIntoView({ block: 'nearest' });
    }

    selectCommand(element = null) {
        const selected = element || document.querySelector('.command-item.selected');
        if (selected) {
            const cmd = selected.dataset.command;
            const input = document.getElementById('messageInput');
            input.value = cmd + ' ';
            input.focus();
            this.hideCommandPalette();
        }
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const content = input.value.trim();

        if (!content) return;

        if (!this.connected) {
            this.displaySystemMessage('Not connected to relay. Please wait...');
            return;
        }

        // Add to history
        this.commandHistory.push(content);
        this.historyIndex = this.commandHistory.length;

        if (content.startsWith('/')) {
            this.handleCommand(content);
        } else {
            if (this.inPMMode && this.currentPM) {
                // Send PM and let sendPM handle the display
                await this.sendPM(content, this.currentPM);
            } else {
                // Send regular message
                await this.publishMessage(content, this.currentChannel, this.currentGeohash);
            }
        }

        input.value = '';
        this.autoResizeTextarea(input);
        this.hideCommandPalette();
        this.hideAutocomplete();
        this.hideEmojiAutocomplete();
    }

    handleCommand(command) {
        const parts = command.split(' ');
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');

        const commandInfo = this.commands[cmd];
        if (commandInfo) {
            commandInfo.fn(args);
        } else {
            this.displaySystemMessage(`Unknown command: ${cmd}`);
        }
    }

    // Command implementations
    showHelp() {
        const helpText = Object.entries(this.commands)
            .map(([cmd, info]) => `${cmd} - ${info.desc}`)
            .join('\n');
        this.displaySystemMessage(`Available commands:\n${helpText}\n\nMarkdown supported: **bold**, *italic*, ~~strikethrough~~, \`code\`, > quote\n\nType : to quickly pick an emoji\n\nNyms are shown as name#xxxx where xxxx is the last 4 characters of their pubkey\n\nClick on users for more options`);
    }

    async cmdJoin(args) {
        if (!args) {
            this.displaySystemMessage('Usage: /join channel or /join #geohash');
            return;
        }

        let channel = args.trim().toLowerCase();

        // Check if it's a geohash
        if (channel.startsWith('#')) {
            const geohash = channel.substring(1);
            this.addChannel(geohash, geohash);
            this.switchChannel(geohash, geohash);
            this.userJoinedChannels.add(geohash); // Mark as user-joined
        } else {
            this.addChannel(channel, '');
            this.switchChannel(channel, '');
            // Create channel with kind 23333
            await this.createChannel(channel);
            this.userJoinedChannels.add(channel); // Mark as user-joined
        }

        // Save after joining
        this.saveUserChannels();
    }

    cmdLeave() {
        if (this.inPMMode) {
            this.displaySystemMessage('Use /pm to switch channels or close PMs from the sidebar');
            return;
        }

        if (this.currentChannel === 'bar' && !this.currentGeohash) {
            this.displaySystemMessage('Cannot leave the default #bar channel');
            return;
        }

        this.removeChannel(this.currentChannel, this.currentGeohash);
    }


    cmdPM(args) {
        if (!args) {
            this.displaySystemMessage('Usage: /pm nym or /pm nym#xxxx');
            return;
        }

        const targetInput = args.trim();

        // Handle both nym and nym#xxxx formats
        let searchNym = targetInput;
        let searchSuffix = null;

        const hashIndex = targetInput.indexOf('#');
        if (hashIndex !== -1) {
            searchNym = targetInput.substring(0, hashIndex);
            searchSuffix = targetInput.substring(hashIndex + 1);
        }

        // Find user by nym, considering suffix if provided
        const matches = [];
        this.users.forEach((user, pubkey) => {
            const baseNym = user.nym.split('#')[0] || user.nym;
            if (baseNym === searchNym || baseNym.toLowerCase() === searchNym.toLowerCase()) {
                if (searchSuffix) {
                    // If suffix provided, only match exact pubkey suffix
                    if (pubkey.endsWith(searchSuffix)) {
                        matches.push({ nym: user.nym, pubkey: pubkey });
                    }
                } else {
                    // No suffix provided, collect all matches
                    matches.push({ nym: user.nym, pubkey: pubkey });
                }
            }
        });

        if (matches.length === 0) {
            this.displaySystemMessage(`User ${targetInput} not found`);
            return;
        }

        if (matches.length > 1 && !searchSuffix) {
            // Multiple users with same nym, show them
            const matchList = matches.map(m =>
                `${this.formatNymWithPubkey(m.nym, m.pubkey)}`
            ).join(', ');
            this.displaySystemMessage(`Multiple users found with nym "${searchNym}": ${matchList}`);
            this.displaySystemMessage('Please specify using the #xxxx suffix');
            return;
        }

        // Single match or exact suffix match
        const targetPubkey = matches[0].pubkey;
        const targetNym = matches[0].nym;

        if (targetPubkey === this.pubkey) {
            this.displaySystemMessage("You can't send private messages to yourself");
            return;
        }

        this.openUserPM(targetNym, targetPubkey);
    }

    async cmdNick(args) {
        if (!args) {
            this.displaySystemMessage('Usage: /nick newnym');
            return;
        }

        const oldNym = this.nym;
        const newNym = args.trim().substring(0, 20);

        if (oldNym === newNym) {
            this.displaySystemMessage('That is already your current nym');
            return;
        }

        this.nym = newNym;
        document.getElementById('currentNym').textContent = this.nym;

        // Save profile for persistent connections
        if (this.connectionMode !== 'ephemeral') {
            await this.saveToNostrProfile();
        }

        const changeMessage = `Your nym's new nick is now ${this.nym}`;
        this.displaySystemMessage(changeMessage);
    }

    cmdWho() {
        const currentChannelKey = this.currentGeohash || this.currentChannel;
        const channelUserSet = this.channelUsers.get(currentChannelKey) || new Set();

        const users = Array.from(channelUserSet)
            .map(pubkey => this.users.get(pubkey))
            .filter(u => u && Date.now() - u.lastSeen < 300000)
            .filter(u => !this.blockedUsers.has(u.nym))
            .map(u => {
                const baseNym = u.nym.split('#')[0] || u.nym;
                const suffix = this.getPubkeySuffix(u.pubkey);
                return `${this.escapeHtml(baseNym)}<span class="nym-suffix">#${suffix}</span>`;
            })
            .join(', ');

        this.displaySystemMessage(`Online nyms in this channel: ${users || 'none'}`);
    }

    cmdClear() {
        document.getElementById('messagesContainer').innerHTML = '';
        this.displaySystemMessage('Chat cleared');
    }

    async cmdInvite(args) {
        if (!args) {
            this.displaySystemMessage('Usage: /invite nym or /invite nym#xxxx');
            return;
        }

        if (this.inPMMode) {
            this.displaySystemMessage('Cannot invite users while in PM mode');
            return;
        }

        const targetInput = args.trim();
        let targetPubkey = null;
        let matchedNym = null;

        // Check if input has #xxxx suffix
        const hashIndex = targetInput.indexOf('#');
        let searchNym = targetInput;
        let searchSuffix = null;

        if (hashIndex !== -1) {
            searchNym = targetInput.substring(0, hashIndex);
            searchSuffix = targetInput.substring(hashIndex + 1);
        }

        // Find user by nym, considering suffix if provided
        const matches = [];
        this.users.forEach((user, pubkey) => {
            if (user.nym === searchNym || user.nym.toLowerCase() === searchNym.toLowerCase()) {
                if (searchSuffix) {
                    // If suffix provided, only match exact pubkey suffix
                    if (pubkey.endsWith(searchSuffix)) {
                        matches.push({ nym: user.nym, pubkey: pubkey });
                    }
                } else {
                    // No suffix provided, collect all matches
                    matches.push({ nym: user.nym, pubkey: pubkey });
                }
            }
        });

        if (matches.length === 0) {
            this.displaySystemMessage(`User ${targetInput} not found`);
            return;
        }

        if (matches.length > 1 && !searchSuffix) {
            // Multiple users with same nym, show them
            const matchList = matches.map(m =>
                `${this.formatNymWithPubkey(m.nym, m.pubkey)}`
            ).join(', ');
            this.displaySystemMessage(`Multiple users found with nym "${searchNym}": ${matchList}`);
            this.displaySystemMessage('Please specify using the #xxxx suffix');
            return;
        }

        // Single match or exact suffix match
        targetPubkey = matches[0].pubkey;
        matchedNym = matches[0].nym;

        if (targetPubkey === this.pubkey) {
            this.displaySystemMessage("You can't invite yourself");
            return;
        }

        // Create channel info
        const channelInfo = this.currentGeohash ?
            `#${this.currentGeohash} [GEO]` :
            `#${this.currentChannel} [STD]`;

        // Send an invitation as a PM
        const inviteMessage = `📨 Channel Invitation: You've been invited to join ${channelInfo}. Use /join ${this.currentGeohash || this.currentChannel} to join!`;

        // Send as PM
        const sent = await this.sendPM(inviteMessage, targetPubkey);

        if (sent) {
            const displayNym = this.formatNymWithPubkey(matchedNym, targetPubkey);
            this.displaySystemMessage(`Invitation sent to ${displayNym} for ${channelInfo}`);

            // Also send a mention in the current channel
            const publicNotice = `@${matchedNym} you've been invited to this channel! Check your PMs for details.`;
            await this.publishMessage(publicNotice, this.currentChannel, this.currentGeohash);
        } else {
            this.displaySystemMessage(`Failed to send invitation to ${this.formatNymWithPubkey(matchedNym, targetPubkey)}`);
        }
    }

    async cmdBlock(args) {
        if (!args) {
            // If no args, check if in a channel that can be blocked
            if (this.inPMMode) {
                this.displaySystemMessage('Usage: /block nym, /block nym#xxxx, or /block #channel');
                return;
            }

            // Check current channel
            const currentChannelName = this.currentGeohash || this.currentChannel;
            if (currentChannelName === 'bar' && !this.currentGeohash) {
                this.displaySystemMessage('Cannot block the default #bar channel');
                return;
            }

            // Block current channel
            if (confirm(`Block channel #${currentChannelName}?`)) {
                if (this.currentGeohash) {
                    this.blockChannel(this.currentGeohash, this.currentGeohash);
                    this.displaySystemMessage(`Blocked geohash channel #${this.currentGeohash}`);
                } else {
                    this.blockChannel(this.currentChannel, '');
                    this.displaySystemMessage(`Blocked channel #${this.currentChannel}`);
                }

                // Switch to #bar
                this.switchChannel('bar', '');

                this.updateBlockedChannelsList();

                // Sync to Nostr
                if (this.connectionMode !== 'ephemeral') {
                    await this.saveSyncedSettings();
                }
            }
            return;
        }

        const target = args.trim();

        // Check if it's a channel block
        if (target.startsWith('#') && !target.includes('@')) {
            const channelName = target.substring(1);

            // Check if it's current channel
            if ((this.currentChannel === channelName && !this.currentGeohash) ||
                (this.currentGeohash === channelName)) {
                // Block current channel and switch to bar
                if (confirm(`Block and leave channel #${channelName}?`)) {
                    if (this.isValidGeohash(channelName)) {
                        this.blockChannel(channelName, channelName);
                        this.displaySystemMessage(`Blocked geohash channel #${channelName}`);
                    } else {
                        this.blockChannel(channelName, '');
                        this.displaySystemMessage(`Blocked channel #${channelName}`);
                    }

                    // Switch to #bar
                    this.switchChannel('bar', '');

                    this.updateBlockedChannelsList();

                    // Sync to Nostr
                    if (this.connectionMode !== 'ephemeral') {
                        await this.saveSyncedSettings();
                    }
                }
                return;
            }

            // Don't allow blocking #bar
            if (channelName === 'bar') {
                this.displaySystemMessage("Cannot block the default #bar channel");
                return;
            }

            // Determine if it's a geohash or standard channel
            if (this.isValidGeohash(channelName)) {
                this.blockChannel(channelName, channelName);
                this.displaySystemMessage(`Blocked geohash channel #${channelName}`);
            } else {
                this.blockChannel(channelName, '');
                this.displaySystemMessage(`Blocked channel #${channelName}`);
            }

            this.updateBlockedChannelsList();

            // Sync to Nostr
            if (this.connectionMode !== 'ephemeral') {
                await this.saveSyncedSettings();
            }

            return;
        }

        // For user blocking, handle suffix
        const hashIndex = target.indexOf('#');
        let searchNym = target;
        let searchSuffix = null;

        if (hashIndex !== -1) {
            searchNym = target.substring(0, hashIndex);
            searchSuffix = target.substring(hashIndex + 1);
        }

        // Find matching users
        const matches = [];
        this.users.forEach((user, pubkey) => {
            const baseNym = user.nym.split('#')[0] || user.nym;
            if (baseNym === searchNym || baseNym.toLowerCase() === searchNym.toLowerCase()) {
                if (searchSuffix) {
                    if (pubkey.endsWith(searchSuffix)) {
                        matches.push({ nym: user.nym, pubkey: pubkey });
                    }
                } else {
                    matches.push({ nym: user.nym, pubkey: pubkey });
                }
            }
        });

        if (matches.length === 0) {
            this.displaySystemMessage(`User ${target} not found`);
            return;
        }

        if (matches.length > 1 && !searchSuffix) {
            const matchList = matches.map(m =>
                `${this.formatNymWithPubkey(m.nym, m.pubkey)}`
            ).join(', ');
            this.displaySystemMessage(`Multiple users found with nym "${searchNym}": ${matchList}`);
            this.displaySystemMessage('Please specify using the #xxxx suffix');
            return;
        }

        const nym = matches[0].nym;

        // Check if already blocked to toggle
        if (this.blockedUsers.has(nym)) {
            await this.cmdUnblock(target);
            return;
        }

        this.blockedUsers.add(nym);
        this.saveBlockedUsers();
        this.hideMessagesFromBlockedUser(nym);

        this.displaySystemMessage(`Blocked ${this.formatNymWithPubkey(nym, matches[0].pubkey)}`);
        this.updateUserList();
        this.updateBlockedList();

        // Save to synced settings for persistent connections
        if (this.connectionMode !== 'ephemeral') {
            await this.saveSyncedSettings();
        }
    }

    hideMessagesFromBlockedUser(nym) {
        // Hide messages in current DOM
        document.querySelectorAll('.message').forEach(msg => {
            if (msg.dataset.author === nym) {
                msg.style.display = 'none';
                msg.classList.add('blocked-user-message');
            }
        });

        // Mark messages as blocked in stored messages
        this.messages.forEach((channelMessages, channel) => {
            channelMessages.forEach(msg => {
                if (msg.author === nym) {
                    msg.blocked = true;
                }
            });
        });

        // Mark PM messages as blocked
        this.pmMessages.forEach((conversationMessages, conversationKey) => {
            conversationMessages.forEach(msg => {
                if (msg.author === nym) {
                    msg.blocked = true;
                }
            });
        });
    }

    async cmdUnblock(args) {
        if (!args) {
            this.displaySystemMessage('Usage: /unblock nym, /unblock nym#xxxx, or /unblock #channel');
            return;
        }

        const target = args.trim();

        // Check if it's a channel unblock
        if (target.startsWith('#')) {
            const channelName = target.substring(1);

            if (this.blockedChannels.has(channelName)) {
                if (this.isValidGeohash(channelName)) {
                    this.unblockChannel(channelName, channelName);
                    this.displaySystemMessage(`Unblocked geohash channel #${channelName}`);
                } else {
                    this.unblockChannel(channelName, '');
                    this.displaySystemMessage(`Unblocked channel #${channelName}`);
                }

                this.updateBlockedChannelsList();

                // Sync to Nostr
                if (this.connectionMode !== 'ephemeral') {
                    await this.saveSyncedSettings();
                }
            } else {
                this.displaySystemMessage(`Channel #${channelName} is not blocked`);
            }
            return;
        }

        // User unblock logic
        const hashIndex = target.indexOf('#');
        let searchNym = target;
        let searchSuffix = null;

        if (hashIndex !== -1) {
            searchNym = target.substring(0, hashIndex);
            searchSuffix = target.substring(hashIndex + 1);
        }

        // Try to find the exact nym in blocked list
        let nymToUnblock = null;

        if (this.blockedUsers.has(searchNym)) {
            nymToUnblock = searchNym;
        } else {
            // Search case-insensitively
            for (const blockedNym of this.blockedUsers) {
                if (blockedNym.toLowerCase() === searchNym.toLowerCase()) {
                    nymToUnblock = blockedNym;
                    break;
                }
            }
        }

        if (!nymToUnblock) {
            this.displaySystemMessage(`User ${target} is not blocked`);
            return;
        }

        this.blockedUsers.delete(nymToUnblock);
        this.saveBlockedUsers();
        this.showMessagesFromUnblockedUser(nymToUnblock);

        this.displaySystemMessage(`Unblocked ${nymToUnblock}`);
        this.updateUserList();
        this.updateBlockedList();

        // Save to synced settings for persistent connections
        if (this.connectionMode !== 'ephemeral') {
            await this.saveSyncedSettings();
        }
    }

    showMessagesFromUnblockedUser(nym) {
        // Show messages in current DOM (unless blocked by keywords)
        document.querySelectorAll('.message.blocked-user-message').forEach(msg => {
            if (msg.dataset.author === nym) {
                const content = msg.querySelector('.message-content');
                if (!content || !this.hasBlockedKeyword(content.textContent)) {
                    msg.style.display = '';
                    msg.classList.remove('blocked-user-message');
                }
            }
        });

        // Unmark messages in stored messages
        this.messages.forEach((channelMessages, channel) => {
            channelMessages.forEach(msg => {
                if (msg.author === nym) {
                    delete msg.blocked;
                }
            });
        });

        // Unmark PM messages
        this.pmMessages.forEach((conversationMessages, conversationKey) => {
            conversationMessages.forEach(msg => {
                if (msg.author === nym) {
                    delete msg.blocked;
                }
            });
        });
    }

    async cmdSlap(args) {
        if (!args) {
            this.displaySystemMessage('Usage: /slap nym or /slap nym#xxxx');
            return;
        }

        const targetInput = args.trim();
        const hashIndex = targetInput.indexOf('#');
        let searchNym = targetInput;
        let searchSuffix = null;

        if (hashIndex !== -1) {
            searchNym = targetInput.substring(0, hashIndex);
            searchSuffix = targetInput.substring(hashIndex + 1);
        }

        // Find matching users
        const matches = [];
        this.users.forEach((user, pubkey) => {
            const baseNym = user.nym.split('#')[0] || user.nym;
            if (baseNym === searchNym || baseNym.toLowerCase() === searchNym.toLowerCase()) {
                if (searchSuffix) {
                    if (pubkey.endsWith(searchSuffix)) {
                        matches.push({ nym: user.nym, pubkey: pubkey });
                    }
                } else {
                    matches.push({ nym: user.nym, pubkey: pubkey });
                }
            }
        });

        if (matches.length > 1 && !searchSuffix) {
            const matchList = matches.map(m =>
                `${this.formatNymWithPubkey(m.nym, m.pubkey)}`
            ).join(', ');
            this.displaySystemMessage(`Multiple users found with nym "${searchNym}": ${matchList}`);
            this.displaySystemMessage('Please specify using the #xxxx suffix');
            return;
        }

        // Use the target nym for the action (without suffix for cleaner message)
        const targetNym = matches.length > 0 ? matches[0].nym : searchNym;
        await this.publishMessage(`/me slaps ${targetNym} around a bit with a large trout`);
    }

    async cmdMe(args) {
        if (!args) {
            this.displaySystemMessage('Usage: /me action');
            return;
        }
        await this.publishMessage(`/me ${args}`);
    }

    async cmdShrug() {
        await this.publishMessage('¯\\_(ツ)_/¯');
    }

    async cmdBold(args) {
        if (!args) {
            this.displaySystemMessage('Usage: /bold text');
            return;
        }
        await this.publishMessage(`**${args}**`);
    }

    async cmdItalic(args) {
        if (!args) {
            this.displaySystemMessage('Usage: /italic text');
            return;
        }
        await this.publishMessage(`*${args}*`);
    }

    async cmdCode(args) {
        if (!args) {
            this.displaySystemMessage('Usage: /code text');
            return;
        }
        await this.publishMessage(`\`\`\`\n${args}\n\`\`\``);
    }

    async cmdStrike(args) {
        if (!args) {
            this.displaySystemMessage('Usage: /strike text');
            return;
        }
        await this.publishMessage(`~~${args}~~`);
    }

    async cmdQuote(args) {
        if (!args) {
            this.displaySystemMessage('Usage: /quote text');
            return;
        }

        // Handle both single line and multi-line quotes
        const lines = args.split('\n');
        const quotedText = lines.map(line => `> ${line}`).join('\n');
        await this.publishMessage(quotedText);
    }

    cmdBRB(args) {
        if (!args) {
            this.displaySystemMessage('Usage: /brb message (e.g., /brb lunch, back in 30)');
            return;
        }

        const message = args.trim();
        this.awayMessages.set(this.pubkey, message);

        // Update user status
        if (this.users.has(this.pubkey)) {
            this.users.get(this.pubkey).status = 'away';
        }

        this.displaySystemMessage(`Away message set: "${message}"`);
        this.displaySystemMessage('You will auto-reply to mentions in ALL channels while away');

        // Clear session storage for BRB responses to allow fresh responses
        const keysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith(`brb_universal_${this.pubkey}_`)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => sessionStorage.removeItem(key));

        this.updateUserList();
    }

    cmdBack() {
        if (this.awayMessages.has(this.pubkey)) {
            this.awayMessages.delete(this.pubkey);

            // Update user status
            if (this.users.has(this.pubkey)) {
                this.users.get(this.pubkey).status = 'online';
            }

            this.displaySystemMessage('Away message cleared - you are back!');

            // Clear all universal BRB response keys
            const keysToRemove = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key && key.startsWith(`brb_universal_${this.pubkey}_`)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => sessionStorage.removeItem(key));

            this.updateUserList();
        } else {
            this.displaySystemMessage('You were not away');
        }
    }

    async cmdZap(args) {
        if (!args) {
            this.displaySystemMessage('Usage: /zap nym or /zap nym#xxxx');
            return;
        }

        const targetInput = args.trim();
        const hashIndex = targetInput.indexOf('#');
        let searchNym = targetInput;
        let searchSuffix = null;

        if (hashIndex !== -1) {
            searchNym = targetInput.substring(0, hashIndex);
            searchSuffix = targetInput.substring(hashIndex + 1);
        }

        // Find matching users
        const matches = [];
        this.users.forEach((user, pubkey) => {
            if (user.nym === searchNym || user.nym.toLowerCase() === searchNym.toLowerCase()) {
                if (searchSuffix) {
                    if (pubkey.endsWith(searchSuffix)) {
                        matches.push({ nym: user.nym, pubkey: pubkey });
                    }
                } else {
                    matches.push({ nym: user.nym, pubkey: pubkey });
                }
            }
        });

        if (matches.length === 0) {
            this.displaySystemMessage(`User ${targetInput} not found`);
            return;
        }

        if (matches.length > 1 && !searchSuffix) {
            const matchList = matches.map(m =>
                `${this.formatNymWithPubkey(m.nym, m.pubkey)}`
            ).join(', ');
            this.displaySystemMessage(`Multiple users found with nym "${searchNym}": ${matchList}`);
            this.displaySystemMessage('Please specify using the #xxxx suffix');
            return;
        }

        const targetPubkey = matches[0].pubkey;
        const targetNym = matches[0].nym;

        if (targetPubkey === this.pubkey) {
            this.displaySystemMessage("You can't zap yourself");
            return;
        }

        // Check for lightning address
        const displayNym = this.formatNymWithPubkey(targetNym, targetPubkey);
        this.displaySystemMessage(`Checking if @${displayNym} can receive zaps...`);

        const lnAddress = await this.fetchLightningAddressForUser(targetPubkey);

        if (lnAddress) {
            // Show zap modal for profile zap (no messageId)
            this.showProfileZapModal(targetPubkey, targetNym, lnAddress);
        } else {
            this.displaySystemMessage(`@${displayNym} cannot receive zaps (no lightning address set)`);
        }
    }

    cmdQuit() {
        this.displaySystemMessage('Disconnecting from NYM...');

        // Clear saved connection preferences
        localStorage.removeItem('nym_connection_mode');
        localStorage.removeItem('nym_relay_url');
        localStorage.removeItem('nym_nsec'); // Clear saved nsec

        // Clear pubkey-specific lightning address
        if (this.pubkey) {
            localStorage.removeItem(`nym_lightning_address_${this.pubkey}`);
        }

        if (this.ws) {
            this.ws.close();
        }
        setTimeout(() => {
            location.reload();
        }, 1000);
    }

    loadBlockedChannels() {
        const saved = localStorage.getItem('nym_blocked_channels');
        if (saved) {
            this.blockedChannels = new Set(JSON.parse(saved));
        }
    }

    saveBlockedChannels() {
        localStorage.setItem('nym_blocked_channels', JSON.stringify(Array.from(this.blockedChannels)));
    }

    isChannelBlocked(channel, geohash) {
        const key = geohash || channel;
        return this.blockedChannels.has(key);
    }

    blockChannel(channel, geohash) {
        const key = geohash || channel;
        this.blockedChannels.add(key);
        this.saveBlockedChannels();

        // Remove from DOM immediately
        const selector = geohash ?
            `[data-geohash="${geohash}"]` :
            `[data-channel="${channel}"][data-geohash=""]`;
        const element = document.querySelector(selector);
        if (element) {
            element.remove();
        }

        // Remove from channels map
        this.channels.delete(key);

        // If currently in this channel, switch to #bar
        if ((this.currentChannel === channel && this.currentGeohash === geohash) ||
            (geohash && this.currentGeohash === geohash)) {
            this.switchChannel('bar', '');
        }

        // Update view more button after removing
        this.updateViewMoreButton('channelList');
    }

    unblockChannel(channel, geohash) {
        const key = geohash || channel;
        this.blockedChannels.delete(key);
        this.saveBlockedChannels();

        // Re-add the channel to the sidebar
        if (geohash) {
            this.addChannel(geohash, geohash);
        } else {
            this.addChannel(channel, '');
        }

        // Update view more button after adding
        this.updateViewMoreButton('channelList');
    }

    updateBlockedChannelsList() {
        const container = document.getElementById('blockedChannelsList');
        if (!container) return;

        if (this.blockedChannels.size === 0) {
            container.innerHTML = '<div style="color: var(--text-dim); font-size: 12px;">No blocked channels</div>';
        } else {
            container.innerHTML = Array.from(this.blockedChannels).map(key => {
                const displayName = this.isValidGeohash(key) ? `#${key} [GEO]` : `#${key} [STD]`;
                return `
        <div class="blocked-item">
            <span>${this.escapeHtml(displayName)}</span>
            <button class="unblock-btn" onclick="nym.unblockChannelFromSettings('${this.escapeHtml(key)}')">Unblock</button>
        </div>
    `;
            }).join('');
        }
    }

    unblockChannelFromSettings(key) {
        if (this.isValidGeohash(key)) {
            this.unblockChannel(key, key);
        } else {
            this.unblockChannel(key, '');
        }
        this.updateBlockedChannelsList();

        // Sync to Nostr if logged in
        if (this.connectionMode !== 'ephemeral') {
            this.saveSyncedSettings();
        }
    }

    switchChannel(channel, geohash = '') {
        this.inPMMode = false;
        this.currentPM = null;
        this.currentChannel = channel;
        this.currentGeohash = geohash;

        const displayName = geohash ? `#${geohash}` : `#${channel}`;
        let fullTitle = displayName;

        // Add location for geohash channels
        if (geohash && geohash !== '') {
            const location = this.getGeohashLocation(geohash);
            console.log(`Getting location for geohash ${geohash}: ${location}`);

            if (location) {
                fullTitle = `${displayName} <br/><font size="2" style="color: var(--text-dim);text-shadow:none;"><a style="color: var(--text-dim);text-shadow:none;" href="https://www.geohash.es/decode?geohash=${geohash}" target="_blank" rel="noopener">${location}</a></font>`;

                if (this.userLocation && this.settings.sortByProximity) {
                    try {
                        const coords = this.decodeGeohash(geohash);
                        const distance = this.calculateDistance(
                            this.userLocation.lat, this.userLocation.lng,
                            coords.lat, coords.lng
                        );
                        fullTitle = `${displayName} <br/><font size="2" style="color: var(--text-dim);text-shadow:none;"><a style="color: var(--text-dim);text-shadow:none;" href="https://www.geohash.es/decode?geohash=${geohash}" target="_blank" rel="noopener">${location}</a> (${distance.toFixed(1)}km)</font>`;
                    } catch (e) {
                        console.error('Distance calculation error:', e);
                    }
                }
            }
        }

        console.log('Setting channel title to:', fullTitle);
        document.getElementById('currentChannel').innerHTML = fullTitle;

        // Update active state
        document.querySelectorAll('.channel-item').forEach(item => {
            const isActive = item.dataset.channel === channel &&
                item.dataset.geohash === geohash;
            item.classList.toggle('active', isActive);
        });

        document.querySelectorAll('.pm-item').forEach(item => {
            item.classList.remove('active');
        });

        // Clear unread count
        const unreadKey = geohash ? `#${geohash}` : channel;
        this.clearUnreadCount(unreadKey);

        // Load channel messages
        this.loadChannelMessages(displayName);

        // Update user list for this channel
        this.updateUserList();

        // Close mobile sidebar on mobile
        if (window.innerWidth <= 768) {
            this.closeSidebar();
        }
    }

    loadChannelMessages(displayName) {
        const container = document.getElementById('messagesContainer');
        container.innerHTML = '';

        const storageKey = this.currentGeohash ? `#${this.currentGeohash}` : this.currentChannel;
        const channelMessages = this.messages.get(storageKey) || [];

        // Sort messages by timestamp
        channelMessages.sort((a, b) => a.timestamp - b.timestamp);

        // Display messages, filtering out blocked users
        channelMessages.forEach(msg => {
            if (!this.blockedUsers.has(msg.author) && !msg.blocked) {
                this.displayMessage(msg);
            }
        });

        if (channelMessages.length === 0) {
            this.displaySystemMessage(`Joined ${displayName}`);
        }
    }

    addChannel(channel, geohash = '') {
        const list = document.getElementById('channelList');
        const key = geohash || channel;

        // Don't add blocked channels
        if (this.isChannelBlocked(channel, geohash)) {
            console.log(`Channel ${key} is blocked, not adding to list`);
            return;
        }

        if (!document.querySelector(`[data-channel="${channel}"][data-geohash="${geohash}"]`)) {
            const item = document.createElement('div');
            item.className = 'channel-item list-item';
            item.dataset.channel = channel;
            item.dataset.geohash = geohash;

            const displayName = geohash ? `#${geohash}` : `#${channel}`;
            const badge = geohash ? '<span class="geohash-badge">GEO</span>' : '<span class="std-badge">STD</span>';

            // Get location information for geohash channels
            let locationHint = '';
            if (geohash) {
                const location = this.getGeohashLocation(geohash);
                if (location) {
                    locationHint = ` title="${location}"`;
                }
            }

            const isPinned = this.pinnedChannels.has(key);
            if (isPinned) {
                item.classList.add('pinned');
            }

            // Don't show pin button for #bar
            const isBar = channel === 'bar' && !geohash;
            const pinButton = isBar ? '' : `
    <span class="pin-btn ${isPinned ? 'pinned' : ''}" data-channel="${channel}" data-geohash="${geohash}">
        <svg viewBox="0 0 24 24">
            <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z"/>
        </svg>
    </span>
`;

            item.innerHTML = `
    <span class="channel-name"${locationHint}>${displayName}</span>
    <div class="channel-badges">
        ${pinButton}
        ${badge}
        <span class="unread-badge" style="display:none">0</span>
    </div>
`;

            // Add pin button handler using event listener instead of inline onclick
            if (!isBar) {
                const pinBtn = item.querySelector('.pin-btn');
                if (pinBtn) {
                    pinBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        this.togglePin(channel, geohash);
                    });
                }
            }

            // Insert before the view more button if it exists
            const viewMoreBtn = list.querySelector('.view-more-btn');
            if (viewMoreBtn) {
                list.insertBefore(item, viewMoreBtn);
            } else {
                list.appendChild(item);
            }

            this.channels.set(key, { channel, geohash });
            this.updateChannelPins();

            // Check if we need to add/update view more button
            this.updateViewMoreButton('channelList');
        }
    }

    updateViewMoreButton(listId) {
        const list = document.getElementById(listId);
        if (!list) return;

        // Don't manage view more button if search is active
        const searchInput = list.parentElement?.querySelector('.search-input.active');
        if (searchInput && searchInput.value.trim().length > 0) {
            return;
        }

        const items = list.querySelectorAll('.list-item:not(.search-hidden)');
        let existingBtn = list.querySelector('.view-more-btn');

        // Get current expansion state
        const isExpanded = this.listExpansionStates.get(listId) || false;

        if (items.length > 20) {
            // We need a button
            if (!existingBtn) {
                const btn = document.createElement('div');
                btn.className = 'view-more-btn';
                btn.onclick = () => this.toggleListExpansion(listId);
                list.appendChild(btn);
                existingBtn = btn;
            }

            // Update button text based on state
            if (isExpanded) {
                existingBtn.textContent = 'Show less';
                list.classList.remove('list-collapsed');
                list.classList.add('list-expanded');
            } else {
                existingBtn.textContent = `View ${items.length - 20} more...`;
                list.classList.add('list-collapsed');
                list.classList.remove('list-expanded');
            }

            // Make sure button is visible
            existingBtn.style.display = 'block';
        } else {
            // Don't need a button - remove if exists
            if (existingBtn) {
                existingBtn.remove();
            }
            list.classList.remove('list-collapsed', 'list-expanded');
            // Clear expansion state since button is gone
            this.listExpansionStates.delete(listId);
        }
    }

    toggleListExpansion(listId) {
        const list = document.getElementById(listId);
        if (!list) return;

        let btn = list.querySelector('.view-more-btn');
        const items = list.querySelectorAll('.list-item');

        // Toggle the state
        const currentState = this.listExpansionStates.get(listId) || false;
        const newState = !currentState;
        this.listExpansionStates.set(listId, newState);

        if (newState) {
            // Expanding
            list.classList.remove('list-collapsed');
            list.classList.add('list-expanded');

            // Move button to the end of the list
            if (btn) {
                btn.remove();
                btn = document.createElement('div');
                btn.className = 'view-more-btn';
                btn.textContent = 'Show less';
                btn.onclick = () => this.toggleListExpansion(listId);
                list.appendChild(btn);
            }
        } else {
            // Collapsing
            list.classList.add('list-collapsed');
            list.classList.remove('list-expanded');

            // Move button back to after the 20th item
            if (btn) {
                btn.remove();
                btn = document.createElement('div');
                btn.className = 'view-more-btn';
                btn.textContent = `View ${items.length - 20} more...`;
                btn.onclick = () => this.toggleListExpansion(listId);

                // Insert after the 20th visible item
                if (items.length > 20 && items[19]) {
                    items[19].insertAdjacentElement('afterend', btn);
                } else {
                    list.appendChild(btn);
                }
            }
        }
    }

    removeChannel(channel, geohash = '') {
        const key = geohash || channel;

        // Don't allow removing #bar (default channel)
        if (channel === 'bar' && !geohash) {
            this.displaySystemMessage('Cannot remove the default #bar channel');
            return;
        }

        // Remove from channels map
        this.channels.delete(key);

        // Remove from user-joined set
        this.userJoinedChannels.delete(key);

        // Remove from DOM
        const selector = geohash ?
            `[data-geohash="${geohash}"]` :
            `[data-channel="${channel}"][data-geohash=""]`;
        const element = document.querySelector(selector);
        if (element) {
            element.remove();
        }

        // If we're currently in this channel, switch to #bar
        if ((this.currentChannel === channel && this.currentGeohash === geohash) ||
            (geohash && this.currentGeohash === geohash)) {
            this.switchChannel('bar', '');
        }

        // Save the updated channel list
        this.saveUserChannels();

        this.displaySystemMessage(`Left channel ${geohash ? '#' + geohash : '#' + channel}`);
    }

    // Add right-click context menu for channel items
    setupChannelContextMenu() {
        document.addEventListener('contextmenu', (e) => {
            const channelItem = e.target.closest('.channel-item');
            if (channelItem) {
                e.preventDefault();
                const channel = channelItem.dataset.channel;
                const geohash = channelItem.dataset.geohash;

                // Don't allow removing #bar
                if (channel === 'bar' && !geohash) {
                    return;
                }

                // Create a simple context menu for leaving channel
                const menu = document.createElement('div');
                menu.className = 'context-menu active';
                menu.style.left = e.pageX + 'px';
                menu.style.top = e.pageY + 'px';
                menu.innerHTML = `
        <div class="context-menu-item" onclick="nym.removeChannel('${channel}', '${geohash}'); this.parentElement.remove();">
            Leave Channel
        </div>
    `;

                // Remove any existing channel context menu
                document.querySelectorAll('.channel-context-menu').forEach(m => m.remove());
                menu.classList.add('channel-context-menu');
                document.body.appendChild(menu);

                // Close on click outside
                setTimeout(() => {
                    document.addEventListener('click', () => menu.remove(), { once: true });
                }, 100);
            }
        });
    }

    saveUserJoinedChannels() {
        const existing = this.loadUserJoinedChannels();
        const combined = new Set([...existing, ...this.userJoinedChannels]);
        localStorage.setItem('nym_user_joined_channels', JSON.stringify(Array.from(combined)));
    }

    loadUserJoinedChannels() {
        const saved = localStorage.getItem('nym_user_joined_channels');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (error) {
                console.error('Failed to load user-joined channels:', error);
                return [];
            }
        }
        return [];
    }

    saveUserChannels() {
        const userChannels = [];
        this.channels.forEach((value, key) => {
            // Only save channels that were explicitly joined by the user
            if (this.userJoinedChannels.has(key)) {
                userChannels.push({
                    key: key,
                    channel: value.channel,
                    geohash: value.geohash
                });
            }
        });

        // Save the channels
        localStorage.setItem('nym_user_channels', JSON.stringify(userChannels));

        // Also save the joined channels set
        this.saveUserJoinedChannels();
    }

    loadUserChannels() {
        const saved = localStorage.getItem('nym_user_channels');
        const savedJoined = localStorage.getItem('nym_user_joined_channels');

        // First, load the joined channels set
        if (savedJoined) {
            try {
                const joinedChannels = JSON.parse(savedJoined);
                joinedChannels.forEach(key => this.userJoinedChannels.add(key));
            } catch (error) {
                console.error('Failed to load joined channels set:', error);
            }
        }

        // Then load the channel details
        if (saved) {
            try {
                const userChannels = JSON.parse(saved);

                userChannels.forEach(({ key, channel, geohash }) => {
                    // Add the channel to the list if not already present
                    if (!this.channels.has(key)) {
                        this.addChannel(channel, geohash);
                    }
                    // Make sure it's marked as user-joined
                    this.userJoinedChannels.add(key);
                });

                // Sort channels after loading
                this.sortChannelsByActivity();

                if (userChannels.length > 0) {
                    this.displaySystemMessage(`Restored ${userChannels.length} previously joined channels`);
                }
            } catch (error) {
                console.error('Failed to load user channels:', error);
            }
        }
    }

    clearUserChannels() {
        localStorage.removeItem('nym_user_channels');
    }

    addChannelToList(channel, geohash) {
        const key = geohash || channel;

        // Check if this channel was previously user-joined
        const wasUserJoined = this.userJoinedChannels.has(key);

        if (geohash && !this.channels.has(geohash)) {
            this.addChannel(geohash, geohash);
            // If it was user-joined, re-add it to the set
            if (wasUserJoined) {
                this.userJoinedChannels.add(geohash);
            }
        } else if (!geohash && !this.channels.has(channel)) {
            this.addChannel(channel, '');
            // If it was user-joined, re-add it to the set
            if (wasUserJoined) {
                this.userJoinedChannels.add(channel);
            }
        }
    }

    updateUnreadCount(channel) {
        const count = (this.unreadCounts.get(channel) || 0) + 1;
        this.unreadCounts.set(channel, count);

        // Handle PM unread counts using conversation key
        if (channel.startsWith('pm-')) {
            // Extract the other user's pubkey from conversation key
            const keys = channel.substring(3).split('-');
            const otherPubkey = keys.find(k => k !== this.pubkey);
            if (otherPubkey) {
                const badge = document.querySelector(`[data-pubkey="${otherPubkey}"] .unread-badge`);
                if (badge) {
                    badge.textContent = count > 99 ? '99+' : count;
                    badge.style.display = count > 0 ? 'block' : 'none';
                }
            }
        } else {
            // Regular channel unread counts
            let selector;
            if (channel.startsWith('#')) {
                // Geohash channel
                selector = `[data-geohash="${channel.substring(1)}"]`;
            } else {
                selector = `[data-channel="${channel}"][data-geohash=""]`;
            }

            const badge = document.querySelector(`${selector} .unread-badge`);
            if (badge) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.style.display = count > 0 ? 'block' : 'none';
            }
        }

        // Re-sort channels by activity
        this.sortChannelsByActivity();
    }

    sortChannelsByActivity() {
        const channelList = document.getElementById('channelList');
        const channels = Array.from(channelList.querySelectorAll('.channel-item'));

        // Save view more button if it exists
        const viewMoreBtn = channelList.querySelector('.view-more-btn');

        // Store current scroll position
        const scrollTop = channelList.scrollTop;

        channels.sort((a, b) => {
            // #bar is always first
            const aIsBar = a.dataset.channel === 'bar' && !a.dataset.geohash;
            const bIsBar = b.dataset.channel === 'bar' && !b.dataset.geohash;

            if (aIsBar) return -1;
            if (bIsBar) return 1;

            // Active channel is second
            const aIsActive = a.classList.contains('active');
            const bIsActive = b.classList.contains('active');

            if (aIsActive && !bIsActive) return -1;
            if (!aIsActive && bIsActive) return 1;

            // Then sort by pinned status
            const aPinned = a.classList.contains('pinned');
            const bPinned = b.classList.contains('pinned');

            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;

            // Check if these are geohash channels
            const aIsGeo = !!a.dataset.geohash && a.dataset.geohash !== '';
            const bIsGeo = !!b.dataset.geohash && b.dataset.geohash !== '';

            // PRIORITY: If proximity sorting is enabled, sort ALL geohash channels by distance first
            if (this.settings.sortByProximity && this.userLocation) {
                // If both are geohash, sort by distance
                if (aIsGeo && bIsGeo) {
                    try {
                        const coordsA = this.decodeGeohash(a.dataset.geohash);
                        const coordsB = this.decodeGeohash(b.dataset.geohash);

                        const distA = this.calculateDistance(
                            this.userLocation.lat, this.userLocation.lng,
                            coordsA.lat, coordsA.lng
                        );
                        const distB = this.calculateDistance(
                            this.userLocation.lat, this.userLocation.lng,
                            coordsB.lat, coordsB.lng
                        );

                        // Return distance comparison (don't fall through to unread count)
                        return distA - distB;
                    } catch (e) {
                        console.error('Error calculating distance:', e);
                        // Fall through to unread count if error
                    }
                }

                // If only one is geo, put geo channels first when proximity sorting is on
                if (aIsGeo && !bIsGeo) return -1;
                if (!aIsGeo && bIsGeo) return 1;
            }

            // Default: sort by unread count for non-geo or when proximity is off
            const aChannel = a.dataset.geohash ? `#${a.dataset.geohash}` : a.dataset.channel;
            const bChannel = b.dataset.geohash ? `#${b.dataset.geohash}` : b.dataset.channel;

            const aUnread = this.unreadCounts.get(aChannel) || 0;
            const bUnread = this.unreadCounts.get(bChannel) || 0;

            if (aUnread === bUnread) return 0;
            return bUnread - aUnread;
        });

        // Clear and re-append
        channelList.innerHTML = '';
        channels.forEach(channel => channelList.appendChild(channel));

        // Re-add view more button
        this.updateViewMoreButton('channelList');

        // Restore scroll position
        channelList.scrollTop = scrollTop;
    }

    clearUnreadCount(channel) {
        const storageKey = channel.startsWith('#') && !this.isValidGeohash(channel.substring(1))
            ? channel.substring(1)
            : channel;

        this.unreadCounts.set(storageKey, 0);

        // Handle PM unread counts using conversation key
        if (storageKey.startsWith('pm-')) {
            // Extract the other user's pubkey from conversation key
            const keys = storageKey.substring(3).split('-');
            const otherPubkey = keys.find(k => k !== this.pubkey);
            if (otherPubkey) {
                const badge = document.querySelector(`[data-pubkey="${otherPubkey}"] .unread-badge`);
                if (badge) {
                    badge.style.display = 'none';
                }
            }
        } else {
            // Regular channel unread counts
            let selector;
            if (channel.startsWith('#')) {
                const channelName = channel.substring(1);
                if (this.isValidGeohash(channelName)) {
                    // It's a geohash
                    selector = `[data-geohash="${channelName}"]`;
                } else {
                    // It's a standard channel with # prefix in display
                    selector = `[data-channel="${channelName}"][data-geohash=""]`;
                }
            } else {
                // Standard channel without # prefix
                selector = `[data-channel="${channel}"][data-geohash=""]`;
            }

            const badge = document.querySelector(`${selector} .unread-badge`);
            if (badge) {
                badge.style.display = 'none';
            }
        }
    }

    navigateHistory(direction) {
        const input = document.getElementById('messageInput');

        if (direction === -1 && this.historyIndex > 0) {
            this.historyIndex--;
            input.value = this.commandHistory[this.historyIndex];
        } else if (direction === 1 && this.historyIndex < this.commandHistory.length - 1) {
            this.historyIndex++;
            input.value = this.commandHistory[this.historyIndex];
        } else if (direction === 1 && this.historyIndex === this.commandHistory.length - 1) {
            this.historyIndex = this.commandHistory.length;
            input.value = '';
        }

        this.autoResizeTextarea(input);
    }

    autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    updateConnectionStatus(status) {
        const statusEl = document.getElementById('connectionStatus');
        const dot = document.getElementById('statusDot');

        // If status is a custom message, show it
        if (status && typeof status === 'string') {
            statusEl.textContent = status;

            // Update dot color based on status text
            if (status.includes('Connected') || status.includes('relays')) {
                dot.style.background = 'var(--primary)';
            } else if (status.includes('Connecting') || status.includes('Discovering')) {
                dot.style.background = 'var(--warning)';
            } else if (status.includes('Failed') || status.includes('Disconnected')) {
                dot.style.background = 'var(--danger)';
            }
        } else {
            // Show actual connected relay count
            const connectedRelays = this.relayPool.size;

            if (connectedRelays > 0) {
                statusEl.textContent = `Connected (${connectedRelays} relays)`;
                dot.style.background = 'var(--primary)';
            } else {
                statusEl.textContent = 'Disconnected';
                dot.style.background = 'var(--danger)';
            }
        }
    }

    setupEmojiPicker() {
        const emojis = this.recentEmojis.length > 0 ? this.recentEmojis : defaultEmojis;
        const picker = document.getElementById('emojiPicker');

        picker.innerHTML = '';
        emojis.forEach(emoji => {
            const btn = document.createElement('button');
            btn.className = 'emoji-btn';
            btn.textContent = emoji;
            btn.onclick = () => this.insertEmoji(emoji);
            picker.appendChild(btn);
        });
    }

    insertEmoji(emoji) {
        const input = document.getElementById('messageInput');
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;

        input.value = text.substring(0, start) + emoji + text.substring(end);
        input.selectionStart = input.selectionEnd = start + emoji.length;
        input.focus();

        this.addToRecentEmojis(emoji);
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobileOverlay');
        const isOpen = sidebar.classList.contains('open');

        if (isOpen) {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        } else {
            sidebar.classList.add('open');
            overlay.classList.add('active');
        }
    }

    showNotification(title, body) {
        if (this.settings.sound !== 'none') {
            this.playSound(this.settings.sound);
        }

        // Check if Notification API is available
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(title, {
                body: body,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23000"/><text x="50" y="55" font-size="40" fill="%230ff" text-anchor="middle" font-family="monospace">NYM</text></svg>'
            });
        }

        // In-app notification (always show this as fallback)
        const notifEl = document.createElement('div');
        notifEl.className = 'notification';
        notifEl.innerHTML = `
            <div class="notification-title">${this.escapeHtml(title)}</div>
            <div class="notification-body">${this.escapeHtml(body)}</div>
            <div class="notification-time">${new Date().toLocaleTimeString()}</div>
        `;
        document.body.appendChild(notifEl);

        setTimeout(() => {
            notifEl.style.animation = 'slideIn 0.3s reverse';
            setTimeout(() => notifEl.remove(), 300);
        }, 3000);
    }

    playSound(type) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        switch (type) {
            case 'beep':
                oscillator.frequency.value = 800;
                gainNode.gain.value = 0.1;
                break;
            case 'icq':
                oscillator.frequency.value = 600;
                gainNode.gain.value = 0.15;
                break;
            case 'msn':
                oscillator.frequency.value = 1000;
                gainNode.gain.value = 0.1;
                break;
        }

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
    }

    applyTheme(theme) {
        const root = document.documentElement;
        document.body.classList.remove('theme-ghost', 'theme-bitchat');

        if (theme === 'ghost') {
            document.body.classList.add('theme-ghost');
        } else if (theme === 'bitchat') {
            document.body.classList.add('theme-bitchat');
        }

        const themes = {
            matrix: {
                primary: '#00ff00',
                secondary: '#00ffff',
                text: '#00ff00',
                textDim: '#008800',
                textBright: '#00ffaa',
                lightning: '#f7931a'
            },
            amber: {
                primary: '#ffb000',
                secondary: '#ffd700',
                text: '#ffb000',
                textDim: '#cc8800',
                textBright: '#ffcc00',
                lightning: '#ffa500'
            },
            cyber: {
                primary: '#ff00ff',
                secondary: '#00ffff',
                text: '#ff00ff',
                textDim: '#aa00aa',
                textBright: '#ff66ff',
                lightning: '#ffaa00'
            },
            hacker: {
                primary: '#00ffff',
                secondary: '#00ff00',
                text: '#00ffff',
                textDim: '#008888',
                textBright: '#66ffff',
                lightning: '#00ff88'
            },
            ghost: {
                primary: '#ffffff',
                secondary: '#cccccc',
                text: '#ffffff',
                textDim: '#666666',
                textBright: '#ffffff',
                lightning: '#dddddd'
            },
            bitchat: {
                primary: '#00ff00',
                secondary: '#00ffff',
                text: '#00ff00',
                textDim: '#008800',
                textBright: '#00ffaa',
                lightning: '#f7931a'
            }
        };

        if (theme === 'ghost') {
            document.body.classList.add('theme-ghost');
        }

        const selectedTheme = themes[theme];
        if (selectedTheme) {
            Object.entries(selectedTheme).forEach(([key, value]) => {
                const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
                root.style.setProperty(cssVar, value);
            });
        }
        this.refreshMessages();
    }

    refreshMessages() {
        // Clear user colors cache when theme changes
        this.userColors.clear();

        // Re-display all messages to apply new colors
        const container = document.getElementById('messagesContainer');
        const messages = container.querySelectorAll('.message');

        messages.forEach(msg => {
            const pubkey = msg.dataset.pubkey;
            const authorElement = msg.querySelector('.message-author');
            if (authorElement) {
                // Remove existing bitchat classes
                const classesToRemove = [];
                authorElement.classList.forEach(cls => {
                    if (cls.startsWith('bitchat-user-') || cls === 'bitchat-theme') {
                        classesToRemove.push(cls);
                    }
                });

                classesToRemove.forEach(cls => authorElement.classList.remove(cls));

                // Add new color class
                const colorClass = this.getUserColorClass(pubkey);
                if (colorClass) {
                    authorElement.classList.add(colorClass);
                }
            }
        });

        // Also refresh user list
        this.updateUserList();
    }

    cleanupBitchatStyles() {
        // Remove all dynamically created bitchat styles
        document.querySelectorAll('style[id^="bitchat-user-"]').forEach(style => {
            style.remove();
        });
    }

    loadSettings() {
        return {
            theme: localStorage.getItem('nym_theme') || 'matrix',
            sound: localStorage.getItem('nym_sound') || 'beep',
            autoscroll: localStorage.getItem('nym_autoscroll') !== 'false',
            showTimestamps: localStorage.getItem('nym_timestamps') !== 'false',
            sortByProximity: localStorage.getItem('nym_sort_proximity') === 'true'
        };
    }

    saveSettings() {
        localStorage.setItem('nym_theme', this.settings.theme);
        localStorage.setItem('nym_sound', this.settings.sound);
        localStorage.setItem('nym_autoscroll', this.settings.autoscroll);
        localStorage.setItem('nym_timestamps', this.settings.showTimestamps);
        localStorage.setItem('nym_sort_proximity', this.settings.sortByProximity);
    }

    loadBlockedUsers() {
        const blocked = localStorage.getItem('nym_blocked');
        if (blocked) {
            this.blockedUsers = new Set(JSON.parse(blocked));
        }
        this.updateBlockedList();
    }

    saveBlockedUsers() {
        localStorage.setItem('nym_blocked', JSON.stringify(Array.from(this.blockedUsers)));
    }

    updateBlockedList() {
        const list = document.getElementById('blockedList');
        if (this.blockedUsers.size === 0) {
            list.innerHTML = '<div style="color: var(--text-dim); font-size: 12px;">No blocked users</div>';
        } else {
            list.innerHTML = Array.from(this.blockedUsers).map(nym => `
                <div class="blocked-item">
                    <span>${this.escapeHtml(nym)}</span>
                    <button class="unblock-btn" onclick="nym.cmdUnblock('${this.escapeHtml(nym)}')">Unblock</button>
                </div>
            `).join('');
        }
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
        };
        return String(text).replace(/[&<>"]/g, m => map[m]);
    }
}