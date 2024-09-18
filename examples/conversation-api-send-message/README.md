# Sending a message to the x-bees channel with attachments

For run this demo you must set correct values for next constants in the file ./src/index.ts

* PBX_SERIAL
* PBX_KEY
* XBS_CHANNEL_ID
* XBS_USER_FROM_ID

### PBX_SERIAL & PBX_KEY

You can receive this values after login to your PBX by ssh and run command 

    cat /rw2/etc/sf2 | head -18 | tail -2 | xargs printf "pbxSerial: %s\npbxKey: %s\n"

### XBS_CHANNEL_ID

You can copy the channel ID into the URL input field of your browser

    https://app.x-bees.com/inbox/<channelId>

### XBS_USER_FROM_ID

You can get the x-bees user ID by running the following command in your browser from the x-bees page in the devtools console
    
    wx.stream._user.id


## Warning

The user on whose behalf you will send a message to the channel must be present in this channel, otherwise you will get an error!


# Live example

https://codesandbox.io/p/devbox/54yytf

