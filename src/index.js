import './style.css'
import { NYM } from './nym.js'
import { getPublicKey } from 'nostr-tools'

// Global instance
const nym = new NYM();

// Global functions for onclick handlers
function toggleSidebar() {
    nym.toggleSidebar();
}

function toggleSearch(inputId) {
    const search = document.getElementById(inputId);
    search.classList.toggle('active');
    if (search.classList.contains('active')) {
        search.focus();
    }
}

function sendMessage() {
    nym.sendMessage();
}

function selectImage() {
    document.getElementById('fileInput').click();
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function closeImageModal() {
    document.getElementById('imageModal').classList.remove('active');
}

function editNick() {
    document.getElementById('newNickInput').value = nym.nym;
    document.getElementById('nickEditModal').classList.add('active');
}

function changeNick() {
    const newNick = document.getElementById('newNickInput').value.trim();
    if (newNick && newNick !== nym.nym) {
        nym.cmdNick(newNick);
    }
    closeModal('nickEditModal');
}

async function changeRelay() {
    const relaySelect = document.getElementById('connectedRelaySelect').value;
    const customRelay = document.getElementById('customConnectedRelay').value;

    const newRelayUrl = relaySelect === 'custom' ? customRelay : relaySelect;

    if (!newRelayUrl) {
        alert('Please select or enter a relay URL');
        return;
    }

    nym.displaySystemMessage('Switching relay...');
    await nym.connectToRelay(newRelayUrl);
}

function showSettings() {
    nym.updateRelayStatus();

    // Load lightning address
    const lightningInput = document.getElementById('lightningAddressInput');
    if (lightningInput) {
        lightningInput.value = nym.lightningAddress || '';
    }

    // Load proximity sorting setting
    const proximitySelect = document.getElementById('proximitySelect');
    if (proximitySelect) {
        proximitySelect.value = nym.settings.sortByProximity ? 'true' : 'false';
    }

    document.getElementById('themeSelect').value = nym.settings.theme;
    document.getElementById('soundSelect').value = nym.settings.sound;
    document.getElementById('autoscrollSelect').value = nym.settings.autoscroll;
    document.getElementById('timestampSelect').value = nym.settings.showTimestamps;
    nym.updateBlockedList();
    nym.updateKeywordList();
    nym.updateBlockedChannelsList();
    document.getElementById('settingsModal').classList.add('active');
}

async function saveSettings() {
    // Get all settings values
    const lightningAddress = document.getElementById('lightningAddressInput').value.trim();
    const theme = document.getElementById('themeSelect').value;
    const sound = document.getElementById('soundSelect').value;
    const autoscroll = document.getElementById('autoscrollSelect').value === 'true';
    const showTimestamps = document.getElementById('timestampSelect').value === 'true';
    const sortByProximity = document.getElementById('proximitySelect').value === 'true';

    // Apply all settings
    nym.settings.theme = theme;
    nym.settings.sound = sound;
    nym.settings.autoscroll = autoscroll;
    nym.settings.showTimestamps = showTimestamps;

    // Handle proximity sorting
    if (sortByProximity) {
        if (!nym.userLocation) {
            // Request location permission
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    nym.userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    nym.settings.sortByProximity = true;
                    localStorage.setItem('nym_sort_proximity', 'true');

                    // IMPORTANT: Re-sort immediately after getting location
                    nym.sortChannelsByActivity();

                    nym.displaySystemMessage('Location access granted. Geohash channels sorted by proximity.');

                    // Sync to Nostr if logged in
                    if (nym.connectionMode !== 'ephemeral') {
                        await nym.saveSyncedSettings();
                    }
                },
                (error) => {
                    nym.displaySystemMessage('Location access denied. Proximity sorting disabled.');
                    nym.settings.sortByProximity = false;
                    localStorage.setItem('nym_sort_proximity', 'false');
                    document.getElementById('proximitySelect').value = 'false';
                }
            );
        } else {
            // Already have location
            nym.settings.sortByProximity = true;
            localStorage.setItem('nym_sort_proximity', 'true');
            nym.sortChannelsByActivity(); // Re-sort
        }
    } else {
        // Disabling
        nym.settings.sortByProximity = false;
        localStorage.setItem('nym_sort_proximity', 'false');
        nym.userLocation = null;
        nym.sortChannelsByActivity(); // Re-sort to default
    }

    // Save theme and other settings
    nym.applyTheme(theme);
    nym.saveSettings();

    // Save lightning address
    if (lightningAddress !== nym.lightningAddress) {
        await nym.saveLightningAddress(lightningAddress || null);
    }

    // Sync to Nostr
    if (nym.connectionMode !== 'ephemeral') {
        await nym.saveSyncedSettings();
        nym.displaySystemMessage('Settings saved and synced to Nostr');
    } else {
        nym.displaySystemMessage('Settings saved locally');
    }

    closeModal('settingsModal');
}

function showAbout() {
    const connectedRelays = nym.relayPool.size;
    nym.displaySystemMessage(`
═══ NYM - Nostr Ynstant Messenger v1.9.12 ═══<br>
Protocol: <a href="https://nostr.com" target="_blank" rel="noopener" style="color: var(--secondary)">Nostr</a> (kinds 20000 and 23333 channels)<br>
Connected Relays: ${connectedRelays} relays<br>
Your nym: ${nym.nym || 'Not set'}<br>
<br>
Created for ephemeral, anonymous communication.<br>
Your identity exists only for this session.<br>
No accounts. No persistence. Just nyms.<br>
<br>
Inspired by and bridged with Jack Dorsey's <a href="https://bitchat.free" target="_blank" rel="noopener" style="color: var(--secondary)">Bitchat</a><br>
<br>
NYM is FOSS code on <a href="https://github.com/Spl0itable/NYM" target="_blank" rel="noopener" style="color: var(--secondary)">GitHub</a><br>
Made with ♥ by <a href="https://nostr.band/npub16jdfqgazrkapk0yrqm9rdxlnys7ck39c7zmdzxtxqlmmpxg04r0sd733sv" target="_blank" rel="noopener" style="color: var(--secondary)">Luxas</a>
`);
}

function showChannelModal() {
    document.getElementById('channelModal').classList.add('active');
}

async function joinChannel() {
    const channelType = document.getElementById('channelTypeSelect').value;

    if (channelType === 'standard') {
        const name = document.getElementById('channelNameInput').value.trim();
        if (name) {
            await nym.cmdJoin(name);
        }
    } else {
        let geohash = document.getElementById('geohashInput').value.trim().toLowerCase();

        // Remove invalid characters
        geohash = geohash.replace(/[^0-9bcdefghjkmnpqrstuvwxyz]/g, '');

        if (geohash) {
            if (!nym.isValidGeohash(geohash)) {
                alert('Invalid geohash. Valid characters are: 0-9, b-z (except a, i, l, o)');
                return;
            }
            await nym.cmdJoin('#' + geohash);
        } else {
            alert('Please enter a valid geohash');
            return;
        }
    }

    closeModal('channelModal');
    document.getElementById('channelNameInput').value = '';
    document.getElementById('geohashInput').value = '';
}


// Function to check for saved connection on page load
async function checkSavedConnection() {
    const savedMode = localStorage.getItem('nym_connection_mode');
    const savedRelay = localStorage.getItem('nym_relay_url');
    const savedNsec = localStorage.getItem('nym_nsec');

    // Check if we have a saved nsec - this should be the priority check
    if (savedNsec) {
        try {
            // Hide setup modal
            const setupModal = document.getElementById('setupModal');
            setupModal.classList.remove('active');

            nym.displaySystemMessage('Restoring NSEC session...');

            // Restore from saved nsec
            nym.privkey = nym.decodeNsec(savedNsec);
            nym.pubkey = getPublicKey(nym.privkey);
            nym.connectionMode = 'nsec'; // Set connection mode

            // Set a default nym while loading profile
            nym.nym = 'Loading profile...';
            document.getElementById('currentNym').textContent = nym.nym;

            // Connect to relays
            await nym.connectToRelays();

            // Fetch profile after connection
            if (nym.connected) {
                await nym.fetchProfileFromRelay(nym.pubkey);

                // If still loading profile, generate a default nym
                if (nym.nym === 'Loading profile...') {
                    nym.nym = nym.generateRandomNym();
                    document.getElementById('currentNym').textContent = nym.nym;
                }
            }

            // Request notification permission
            if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
                Notification.requestPermission();
            }

            // Show welcome back message
            nym.displaySystemMessage(`Welcome back to NYM, ${nym.nym}!`);
            nym.displaySystemMessage(`Your Nostr identity has been restored.`);
            nym.displaySystemMessage(`Type /help for available commands.`);

        } catch (error) {
            console.error('Failed to restore connection:', error);
            // Clear invalid data and show setup modal
            localStorage.removeItem('nym_nsec');
            localStorage.removeItem('nym_connection_mode');
            localStorage.removeItem('nym_relay_url');
            document.getElementById('setupModal').classList.add('active');
        }
        return;
    }

    // Original connection mode restoration logic for extension mode
    if (savedMode === 'extension' && window.nostr) {
        try {
            // Hide setup modal properly by removing active class
            const setupModal = document.getElementById('setupModal');
            setupModal.classList.remove('active');

            nym.displaySystemMessage('Reconnecting with Nostr extension...');
            // Use extension
            await nym.useExtension();

            // Connect to saved relay
            await nym.connectToRelay(savedRelay);

            // Fetch profile after connection
            if (nym.connected) {
                await nym.fetchProfileFromRelay(nym.pubkey);
            }

            // Request notification permission
            if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
                Notification.requestPermission();
            }

            // Show welcome back message
            nym.displaySystemMessage(`Welcome back to NYM, ${nym.nym}!`);
            nym.displaySystemMessage(`Your Nostr identity has been restored.`);
            nym.displaySystemMessage(`Type /help for available commands.`);

        } catch (error) {
            console.error('Failed to restore connection:', error);
            // Show setup modal if auto-connect fails - ensure it has active class
            localStorage.removeItem('nym_connection_mode');
            localStorage.removeItem('nym_relay_url');
            document.getElementById('setupModal').classList.add('active');
        }
    }
    // If no saved connection, modal already has 'active' class from HTML
}

async function initializeNym() {
    try {
        const mode = document.getElementById('connectionMode').value;
        nym.connectionMode = mode; // Store connection mode

        // Get or generate nym first
        const [nymInput, suffix] = document.getElementById('nymInput').value.trim().split('#');
        const status = document.querySelector('#setupModal .status');
        const button = document.querySelector('#setupModal .send-btn');
        status.hidden = false;
        button.disabled = true;

        // Handle different connection modes
        if (mode === 'ephemeral') {
            nym.nym = nymInput || nym.generateRandomNym();
            await nym.generateKeypair(suffix);
            document.getElementById('currentNym').textContent = nym.nym;
            document.getElementById('nymSuffix').textContent = nym.getPubkeySuffix(nym.pubkey);
            localStorage.removeItem('nym_connection_mode');

        } else if (mode === 'extension') {
            await nym.useExtension();

            if (nym.nym === 'Loading profile...' && !nymInput) {
                nym.nym = nym.generateRandomNym();
                document.getElementById('currentNym').textContent = nym.nym;
            } else if (nymInput && nym.nym === 'Loading profile...') {
                nym.nym = nymInput;
                document.getElementById('currentNym').textContent = nym.nym;
            }

        } else if (mode === 'nsec') {
            let nsecValue = document.getElementById('nsecInput').value.trim();

            if (!nsecValue) {
                const savedNsec = localStorage.getItem('nym_nsec');
                if (savedNsec) {
                    nsecValue = savedNsec;
                }
            }

            if (!nsecValue) {
                throw new Error('Please enter your NSEC');
            }

            // Decode NSEC to get private key
            nym.privkey = nym.decodeNsec(nsecValue);
            nym.pubkey = getPublicKey(nym.privkey);

            // Fetch existing profile BEFORE setting nym
            await nym.fetchProfileFromRelay(nym.pubkey);

            // Only use input nym if provided, otherwise use profile name or generate
            if (nymInput) {
                nym.nym = nymInput;
            } else if (!nym.nym || nym.nym === 'Loading profile...') {
                nym.nym = nym.generateRandomNym();
            }

            document.getElementById('currentNym').textContent = nym.nym;

            // Store NSEC securely
            localStorage.setItem('nym_nsec', nsecValue);
        }

        // If nym is still not generated, generate it now
        if (!nym.nym) {
            nym.nym = nym.generateRandomNym();
            document.getElementById('currentNym').textContent = nym.nym;
        }

        // Save connection preferences
        if (mode !== 'ephemeral') {
            localStorage.setItem('nym_connection_mode', mode);
        }

        // Connect to relays
        await nym.connectToRelays();

        // Fetch profile after connection for persistent modes
        if ((mode === 'extension' || mode === 'nsec') && nym.connected) {
            // Fetch profile
            await nym.fetchProfileFromRelay(nym.pubkey);

            // Load synced settings (give relays time to respond)
            setTimeout(() => {
                nym.loadSyncedSettings();
            }, 2000);
        }

        // Request notification permission
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        // Close setup modal
        closeModal('setupModal');
        button.disabled = false;
        status.hidden = true;

        // Show welcome message
        const modeText = mode === 'ephemeral' ? 'ephemeral' : 'persistent Nostr';
        nym.displaySystemMessage(`Welcome to NYM, ${nym.nym}! Type /help for available commands.`);
        nym.displaySystemMessage(`Your ${modeText} identity is active${mode === 'ephemeral' ? ' for this session only' : ''}.`);
        nym.displaySystemMessage(`Click on any nym's nickname for more options.`);

        // Route to channel from URL if present
        await routeToUrlChannel();

    } catch (error) {
        console.error('Initialization failed:', error);
        alert('Failed to initialize: ' + error.message);
    }
}

// Disconnect/logout function
function disconnectNym() {
    // Clear saved connection
    localStorage.removeItem('nym_connection_mode');
    localStorage.removeItem('nym_relay_url');

    // Disconnect from relay
    if (nym && nym.ws) {
        nym.disconnect();
    }

    // Reload page to start fresh
    window.location.reload();
}

// Sign-out button
function signOut() {
    if (confirm('Sign out and disconnect from NYM?')) {
        nym.cmdQuit();
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    // Parse URL for channel routing BEFORE initialization
    parseUrlChannel();

    nym.initialize();

    // Pre-connect to a broadcast relay for instant connection
    async function preConnect() {
        for (const relayUrl of nym.broadcastRelays) {
            try {
                await nym.connectToRelay(relayUrl, 'broadcast');
                console.log(`Pre-connected to ${relayUrl}`);
                nym.updateConnectionStatus('Ready');
                return; // Stop after first successful connection
            } catch (err) {
                console.log(`Failed to pre-connect to ${relayUrl}, trying next...`);
            }
        }
        // If all failed, just log it - the main connection flow will try again
        console.log('Pre-connection failed, will retry during initialization');
    }

    preConnect();

    // Auto-focus nickname input
    document.getElementById('nymInput').focus();

    // Connection mode change listener
    document.getElementById('connectionMode').addEventListener('change', (e) => {
        const mode = e.target.value;
        const nsecGroup = document.getElementById('nsecGroup');
        const nymGroup = document.getElementById('nymGroup');
        const hint = document.getElementById('nymHint');
        const nymInput = document.getElementById('nymInput');
        const nsecInput = document.getElementById('nsecInput');

        // Hide all special groups first
        nsecGroup.style.display = 'none';

        switch (mode) {
            case 'ephemeral':
                hint.textContent = 'Your ephemeral pseudonym for this session';
                nymInput.placeholder = 'Leave empty for random nick';
                break;
            case 'extension':
                hint.textContent = 'Will use your Nostr profile name if available';
                nymInput.placeholder = 'Override profile name (optional)';
                break;
            case 'nsec':
                nsecGroup.style.display = 'block';
                hint.textContent = 'Will use your Nostr profile name if available';
                nymInput.placeholder = 'Override profile name (optional)';

                // Auto-fill saved nsec if available
                const savedNsec = localStorage.getItem('nym_nsec');
                if (savedNsec) {
                    nsecInput.value = savedNsec;
                }
                break;
        }
    });

    // Check if proximity sorting was enabled
    setTimeout(() => {
        if (nym.settings.sortByProximity === true) {
            console.log('Proximity sorting is enabled, requesting location...');
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    nym.userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    console.log('Got user location:', nym.userLocation);
                    // Re-sort channels with location
                    nym.sortChannelsByActivity();
                },
                (error) => {
                    console.error('Location error:', error);
                    nym.settings.sortByProximity = false;
                    localStorage.setItem('nym_sort_proximity', 'false');
                }
            );
        }
    }, 1000);

    // Periodically clean up non-responsive relays
    setInterval(() => {
        if (nym.connected) {
            nym.cleanupNonResponsiveRelays();
        }
    }, 30000); // Check every 30 seconds

    // Periodically update connection status
    setInterval(() => {
        if (nym.connected) {
            nym.updateConnectionStatus();
        }
    }, 5000); // Update every 5 seconds

    // Check for saved connection AFTER initialization is complete
    setTimeout(() => {
        checkSavedConnection();
    }, 100);

    // Periodically update user list
    setInterval(() => {
        if (nym.connected) {
            nym.updateUserList();
        }
    }, 30000);
});

// Parse URL for channel routing
function parseUrlChannel() {
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
        const channelFromUrl = hash.substring(1).toLowerCase();

        // Store for use after initialization
        window.pendingChannel = channelFromUrl;
        console.log('Channel from URL:', channelFromUrl);
    }
}

// Handle channel routing after initialization
async function routeToUrlChannel() {
    if (window.pendingChannel) {
        const channel = window.pendingChannel;
        delete window.pendingChannel;

        // Small delay for persistent connections to ensure relays are ready
        if (nym.connectionMode !== 'ephemeral') {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Determine if it's a geohash or standard channel
        if (nym.isValidGeohash(channel)) {
            // It's a geohash channel
            nym.addChannel(channel, channel);
            nym.switchChannel(channel, channel);
            nym.userJoinedChannels.add(channel);
            nym.displaySystemMessage(`Joined geohash channel #${channel} from URL`);
        } else {
            // It's a standard channel
            nym.addChannel(channel, '');
            nym.switchChannel(channel, '');
            await nym.createChannel(channel);
            nym.userJoinedChannels.add(channel);
            nym.displaySystemMessage(`Joined channel #${channel} from URL`);
        }

        // Save the joined channel
        nym.saveUserChannels();

        // Clear the URL hash to clean up
        history.replaceState(null, null, window.location.pathname);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    // Override the existing search functions to handle collapsed lists properly
    const originalHandleChannelSearch = nym.handleChannelSearch;
    nym.handleChannelSearch = function (searchTerm) {
        // First expand the list to make all items searchable
        const channelList = document.getElementById('channelList');
        const wasCollapsed = channelList.classList.contains('list-collapsed');

        if (wasCollapsed && searchTerm.length > 0) {
            channelList.classList.remove('list-collapsed');
            channelList.classList.add('list-expanded');
        }

        // Call original search function
        originalHandleChannelSearch.call(this, searchTerm);

        // Restore collapsed state if search is cleared
        if (wasCollapsed && searchTerm.length === 0) {
            channelList.classList.add('list-collapsed');
            channelList.classList.remove('list-expanded');
        }
    };

    const originalFilterPMs = nym.filterPMs;
    nym.filterPMs = function (searchTerm) {
        // First expand the list to make all items searchable
        const pmList = document.getElementById('pmList');
        const wasCollapsed = pmList.classList.contains('list-collapsed');

        if (wasCollapsed && searchTerm.length > 0) {
            pmList.classList.remove('list-collapsed');
            pmList.classList.add('list-expanded');
        }

        // Call original filter function
        originalFilterPMs.call(this, searchTerm);

        // Restore collapsed state if search is cleared
        if (wasCollapsed && searchTerm.length === 0) {
            pmList.classList.add('list-collapsed');
            pmList.classList.remove('list-expanded');
        }
    };

    const originalFilterUsers = nym.filterUsers;
    nym.filterUsers = function (searchTerm) {
        // First expand the list to make all items searchable
        const userList = document.getElementById('userListContent');
        const wasCollapsed = userList.classList.contains('list-collapsed');

        if (wasCollapsed && searchTerm.length > 0) {
            userList.classList.remove('list-collapsed');
            userList.classList.add('list-expanded');
        }

        // Call original filter function
        originalFilterUsers.call(this, searchTerm);

        // Restore collapsed state if search is cleared
        if (wasCollapsed && searchTerm.length === 0) {
            userList.classList.add('list-collapsed');
            userList.classList.remove('list-expanded');
        }
    };
});

// Setup event handling
document.addEventListener('DOMContentLoaded', () => {
    const events = ['click', 'input', 'keyup'];

    events.forEach(event => {
        // Get all elements with given attribute
        document.querySelectorAll(`[on${event}]`).forEach(element => {
            const handler = element.getAttribute(`on${event}`);

            if (handler) {
                // Create a function from the attribute value
                const eventHandler = new Function('event', handler);

                // Attach the event handler to the element 
                element.addEventListener(event, () => {
                    eval(handler);
                });

                // Remove the attribute
                element.removeAttribute(`on${event}`);
            }
        });
    });
});