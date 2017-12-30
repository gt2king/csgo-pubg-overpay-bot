const request = require('request');
const fs = require('fs');

var config = require('./config.js');

const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const SteamCommunity = require('steamcommunity');
const TradeOfferManager = require('steam-tradeoffer-manager');

function getCsgoPrices() {

    request({
        method: "GET",
        url: "https://api.steamapi.io/market/prices/730?key=" + config.steamApioKey,
        json: true
    }, function(err, response, body) {
        if (err) {
            return console.log(err)
        }


        var item = body
        fs.writeFile("csgo.json", JSON.stringify(item, undefined, 4), function(err) {
            if (err) {
                return console.log(err)
            }
        })
        console.log("Updated CSGO prices.")
    })

}

function getPubgPrices() {

    request({
        method: "GET",
        url: "https://api.steamapi.io/market/prices/578080?key=" + config.steamApioKey,
        json: true
    }, function(err, response, body) {
        if (err) {
            return console.log(err)
        }


        var item = body
        fs.writeFile("pubg.json", JSON.stringify(item, undefined, 4), function(err) {
            if (err) {
                return console.log(err)
            }
        })
        console.log("Updated PUBG prices.")
    })

}

const client = new SteamUser();

const community = new SteamCommunity();

const manager = new TradeOfferManager({
    steam: client,
    community: community,
    language: 'en'
});




const logOnOptions = {
    accountName: config.username,
    password: config.password,
    twoFactorCode: SteamTotp.generateAuthCode(config.sharedSecret)
};



client.logOn(logOnOptions);



client.on('loggedOn', () => {
    console.log("Logged onto steam succesfully.")
    client.setPersona(SteamUser.Steam.EPersonaState.Online, config.botName);
    client.gamesPlayed([config.customGame, 440]);
});

client.on('webSession', function(sessionID, cookies) {
    manager.setCookies(cookies, function(err) {
        if (err) {
            console.log("Error setting cookies for trade manager: This account is limited");
            return client.logOff();
        }
    });

    community.setCookies(cookies);

    community.startConfirmationChecker(60000, config.identitySecret);

    community.profileSettings({
        profile: 3,
        comments: 3,
        inventory: 3,
        inventoryGifts: true
    });

});

community.on('sessionExpired', function(err) {
    if (err) {
        return console.log("Error on sessionExpired")
    }
    client.webLogOn();
});


manager.on('newOffer', function(offer) {



    console.log(`Incoming offer #${offer.id} from ${offer.partner}`);

    if (offer.partner.getSteamID64() === config.admin && config.acceptAdminTrades === true) {
        console.log(`Offer ${offer.id} is an admin trade.`);
        return acceptOffer(offer);
    }

    if (offer.itemsToGive.length <= 0 && config.acceptDonations === true) {
        console.log(`Offer ${offer.id} is a donation`);
        return acceptOffer(offer);
    }

    fs.readFile('./csgo.json', function(err, data) {
        if (err) {
            console.log("Error getting csgo prices")
        }
        csgoPrices = JSON.parse(data)

        fs.readFile('./pubg.json', function(err, data1) {
            if (err) {
                console.log("Error getting pubg prices.")
            }
            pubgPrices = JSON.parse(data1)



            var ourItems = offer.itemsToGive;
            var theirItems = offer.itemsToReceive;

            var ourValue = 0;
            var theirValue = 0;




            for (i in theirItems) {

                item = theirItems[i];
                name = item.market_hash_name;
                appid = item.appid;

                if (appid !== 730 && appid !== 578080) {
                    console.log("Non pubg/csgo items.");
                }

                if (appid == 578080) {
                    var price = pubgPrices[name];
                    theirValue += Number(price) * config.prices.pubgBuy;

                } else if (appid == 730) {

                    var price = csgoPrices[name] * config.prices.csgoBuy;
                    theirValue += Number(price)
                }
            }

            for (i in ourItems) {

                item = ourItems[i];
                name = item.market_hash_name;
                appid = item.appid;


                if (appid !== 730 && appid !== 578080) {

                    console.log("Non pubg/csgo items.");
                    ourValue += 99999;
                }

                if (appid == 578080) {

                    var price = pubgPrices[name];
                    ourValue += Number(price) * config.prices.pubgSell

                } else if (appid == 730) {

                    var price = csgoPrices[name] * config.prices.csgoSell;
                    ourValue += Number(price);
                }
            }

            var ourFinalValue = ourValue.toFixed(2);
            var theirFinalValue = theirValue.toFixed(2);

            console.log(`Offer #${offer.id} - We are giving ${ourFinalValue} and receiving ${theirFinalValue}`);

            if (ourFinalValue > theirFinalValue) {

                console.log(`Offer #${offer.id} is asking for overpay.`);
                //return declineOffer(offer);
            }

            if (ourFinalValue <= theirFinalValue) {

                console.log(`Offer #${offer.id} seems fair, proceeding.`);
                //return acceptOffer(offer);
            }
        })
    })
})


function declineOffer(offer) {
    offer.decline(function(err) {
        if (err) {
            return console.log("Error declining offer #" + offer.id)
        }
    })
    console.log("Declined offer #" + offer.id)
}

function acceptOffer(offer) {
    offer.accept(false, function(err) {
        if (err) {
            return console.log("Error accepting offer #" + offer.id)
        }
    })
    console.log("Accepted offer #" + offer.id + " - Pending confirmation.");
    community.acceptConfirmationForObject(config.identitySecret, offer.id, function(err) {
        if (err !== null) {
            return console.log("Error confirming offer #" + offer.id + " - Waiting for confirmation checker or already accepted.");
        }
        console.log("Confirmed offer #" + offer.id);
    })
}

setInterval(function() {
    getPubgPrices()
    getCsgoPrices();
}, config.updatePriceTime * 60 * 1000)
