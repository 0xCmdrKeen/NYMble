```
███╗   ██╗██╗   ██╗███╗   ███╗██╗    ██╗
████╗  ██║╚██╗ ██╔╝████╗ ████║██║    ██║
██╔██╗ ██║ ╚████╔╝ ██╔████╔██║██████╗██║██▀▀▀█╗
██║╚██╗██║  ╚██╔╝  ██║╚██╔╝██║██║ ██║██║██▀▀▀▀╝  
██║ ╚████║   ██║   ██║ ╚═╝ ██║██████║██║██████╗  
╚═╝  ╚═══╝   ╚═╝   ╚═╝     ╚═╝╚═════╝╚═╝╚═════╝
```

# Nostr Ynstant Messenger, but less eccentric

A lightweight ephemeral chat client built on Nostr protocol, bridging with [Bitchat](https://bitchat.free) for anonymous, temporary messaging.

This is a fork of [the original](https://github.com/Spl0itable/NYM), which attempts to fix a few issues I've had and add some additional features (such as custom vanity suffixes). See below for a full list of changes.

## Features

- **Ephemeral Identity** - Generate temporary keypairs and pseudonym per session or use Nostr extension
- **Multiple Channels** - Standard channels and geohash-based location channels
- **Reactions** - React to messages
- **Themes** - Pick a desired theme from settings
- **Private Messaging** - Encrypted DMs using NIP-04
- **Bitchat Bridge** - Compatible with Jack Dorsey's Bitchat
- **NEW: Custom vanity suffixes** - Generate a keypair with any suffix you like by entering it in the setup dialog (NOTE: this will take a few seconds)
- **NEW: Hugging supported** - You can now hug people in addition to slapping them with a trout
- **NEW: Reveal user npub** - Someone in chat pretending to be @jack or @calle? Simply grab their public key using `/npub <nym>` and copy it into your favorite Nostr client to see if they're the real deal

## Changes / Bugfixes

The biggest change from the original is under the hood — I refactored the code from one single, large HTML file into seperate files, and added a build system (using [Vite](https://vite.dev)) for quick development iteration and static build generation. Apart from that, I made a few additional changes to improve usability (IMHO):

- **Bitchat native colors** - The Bitchat theme now uses the same algorithm to determine user colors as the original app (including showing your own messages in bright orange). Status messages appear in a more muted color.
- **Improved compatibility** - The /slap and /me commands (as well as the new /hug command) were updated to make the resulting status message display properly in the Bitchat app.
- **Geohashes** - Clicking on a geohash channel's lat/long coordinates will now take you to geohash.es instead of OpenStreetMaps. This seems preferable to me, as it will display the actual boundaries of the hash on a map, instead of its center.
- **No reactions** - Reacting to a message, while cool in principle, isn't compatible with Bitchat, and only visible to other NYM users. In addition, it creates a permament event on Nostr, which doesn't make sense to me as it's in reference to an ephemeral event, that, once expired, can never be found again. Reactions from other NYM users will still show up, however, I've disabled them for the time being until a better approach can be found (i.e. some sort of ephemeral replacement for kind=3 events).
- **Reordered context menu** - The context menu has been reordered to match the original app as closely as possible. The Zap command has been moved to the bottom, and the new hug command has been added. The quote command has been moved right below mention.

## Installation

First, you'll need `git` and a recent version of `node` installed (at least LTS).

Clone the repository, using the `nymble` branch instead of the default:

    git clone https://github.com/0xCmdrKeen/NYMble.git -b nymble
    cd nymble

Then, run `npm install` and start the development server:

    npm run dev

Now open your web browser and go to http://localhost:5173

To generate a static build instead:

    npm run build

Then, upload the contents of the `dist` directory to some sort of web server, or run the a local server using

    npm run preview

NOTE: the preview server will run on http://localhost:4173

## Overview

NYM is a Progressive Web App (PWA) chat messenger that uses Nostr's ephemeral events (kinds 20000 and 23333) for public channels and NIP-04 encrypted events (kind 4) for private messages. No registration, no accounts, no persistence - just pick a nym and start chatting. Or, connect using Nostr Extension for persistent identity.

![NYM Screenshot](https://nym.bar/images/NYM.png)

## Protocol Implementation

- Ephemeral geohash event `kind 20000` and standard channel event `kind 23333`
- Tags: `['n', nym]` for nickname, `['d', channel]` for standard channel, `['g', geohash]` for geohash channel

## Available Commands

```
/help     - Show available commands
/join     - Join a channel (e.g., /join random or /join #geohash)
/j        - Shortcut for /join
/pm       - Send private message (e.g., /pm nym)
/nick     - Change your nym (e.g., /nick newnick)
/who      - List online nyms in current channel
/w        - Shortcut for /who
/clear    - Clear chat messages
/block    - Block a user (e.g., /block nym)
/unblock  - Unblock a user (e.g., /unblock nym)
/hug      - Hug someone (e.g., /hug nym)
/slap     - Slap someone with a trout (e.g., /slap nym)
/me       - Action message (e.g., /me is coding)
/npub     - Display a user's public key (e.g., /npub nym)
/shrug    - Send a shrug ¯\_(ツ)_/¯
/bold     - Send bold text (e.g., /bold text)
/b        - Shortcut for /bold
/italic   - Send italic text (e.g., /italic text)
/i        - Shortcut for /italic
/strike   - Send strikethrough text (e.g., /strike text)
/s        - Shortcut for /strike
/code     - Send code block (e.g., /code text)
/c        - Shortcut for /code
/quote    - Send quoted text (e.g., /quote text)
/q        - Shortcut for /quote
/quit     - Disconnect from NYM
```

## Contributing

Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

Created by [@Luxas](https://nostr.band/npub16jdfqgazrkapk0yrqm9rdxlnys7ck39c7zmdzxtxqlmmpxg04r0sd733sv)

Modifications by [@CmdrKeen](https://nostr.band/npub174tphl6zaczjxvm6k8rrsl7282457apjqf9cm2mrvwev098vz48slylth2)