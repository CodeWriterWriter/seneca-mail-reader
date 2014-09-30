
var MailParser = require('mailparser').MailParser
var fs = require('fs')
var uuid = require('uuid')
var _ = require('lodash');

var pluginName = 'mail-reader'

module.exports = function(options) {

  var seneca = this

  seneca.add({role: pluginName, cmd: 'validateSender'}, function(args, done) {
    // call done() with an error to invalidate the sender
    done()
  })

  seneca.add({role: pluginName, cmd: 'validateRecipient'}, function(args, done) {
    // call done() with an error to invalidate the recipient
    done()
  })

  seneca.add({role: pluginName, cmd: 'attachment'}, function(args, done) {
    var output = fs.createWriteStream(args.attachment.generatedFileName)
    args.attachment.stream.pipe(output)
    done()
  })

  seneca.add({role: pluginName, cmd: 'mail'}, function(args, done) {
    console.log('received email', JSON.stringify(args.mail))
    done()
  })

  seneca.add({role: pluginName, cmd: 'connection'}, function(args, done) {
    done()
  })

  seneca.add({role: pluginName, cmd: 'writeChunk'}, function(args, done) {
    if(!args.connection.id) {
      // Keep count of how many attachments, this will allow us to wait for all of the attachments
      // to be uploaded before triggering the mail event.
      var attachmentCount = 0;
      args.connection.id = uuid.v4()
      args.connection.parser = new MailParser({ streamAttachments: true })
      // Create function that will be called after each attachment is uploaded. For now it will
      // decrease the count of attachments, but once the 'end' event is triggered, this function
      // will be replaced with a _.after. Using _.after will wait for function to be called
      // (attachmentCount) times before moving along.
      var doneUploadingAttachment = function () {
        attachmentCount--;
      };
      args.connection.parser.on('attachment', function (attachment) {
        attachmentCount++;
        // Redirect attachment to seneca
        seneca.act({
          role: pluginName,
          cmd: 'attachment',
          connection: args.connection,
          attachment: attachment
        }, function () {
          // Mark this attachment as uploaded
          doneUploadingAttachment();
        });
      });
      args.connection.parser.on("end", function(mail){
        // Now that we have a count of actual attachments, lets wait for x amount of callbacks
        // to be called before sending the new mail event. This way each attachment can add info
        // to the connection and link attachment ids to the mail
        doneUploadingAttachment = _.after(attachmentCount, function () {
          seneca.act({role: pluginName, cmd: 'mail', mail: mail, connection: args.connection})
        });
        // If there's no attachments, call mail
        if (attachmentCount === 0) { doneUploadingAttachment(); }
      })
    }
    args.connection.parser.write(args.chunk)
    done()
  })

  seneca.add({role: pluginName, cmd: 'writeEnd'}, function(args, done) {
    args.connection.parser.end()
    args.connection.parser.removeListener('attachment', redirectAttachmentStreamToSeneca)
    done()
  })

  return {
    name: pluginName
  }

}
