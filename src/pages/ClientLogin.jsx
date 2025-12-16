import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";

export default function ClientLogin() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSendLink = async (e) => {
    e.preventDefault();
    setSending(true);

    try {
      // Generate random token
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Find client contact
      const contacts = await base44.entities.ClientContact.filter({ email });
      
      if (contacts.length > 0 && contacts[0].active) {
        const contact = contacts[0];
        
        // Store token (hash it in production)
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        
        await base44.entities.ClientPortalLoginToken.create({
          client_contact_id: contact.id,
          token_hash: token, // In production, hash this
          expires_at: expiresAt.toISOString(),
        });

        // Send magic link email
        const magicLink = `${window.location.origin}/client/auth?token=${token}`;
        await base44.integrations.Core.SendEmail({
          to: email,
          subject: 'Your Client Portal Login Link',
          body: `Click here to access your client portal: ${magicLink}\n\nThis link expires in 24 hours.`,
        });
      }

      // Always show success to prevent email enumeration
      setSent(true);
    } catch (error) {
      // Still show success to prevent enumeration
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-black/60 backdrop-blur-xl border border-gray-700">
        <CardContent className="p-8 space-y-6">
          <div className="text-center space-y-2">
            <img 
              src="https://achtungkraft.com/cdn/shop/files/AchtungLogoSticker_39633eb9-a276-4e81-8376-b8fef51b08d6.png"
              alt="Ächtung Kraft"
              className="h-12 mx-auto mb-4"
            />
            <h1 className="text-2xl font-bold text-white">Client Portal</h1>
            <p className="text-gray-400">Enter your email to receive a login link</p>
          </div>

          {!sent ? (
            <form onSubmit={handleSendLink} className="space-y-4">
              <div>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="bg-gray-800 border-gray-700 text-white"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={sending}
                className="w-full bg-red-600 hover:bg-red-700"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Mail className="w-4 h-4 mr-2" />
                )}
                Send me a login link
              </Button>
            </form>
          ) : (
            <div className="text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Check your email</h3>
                <p className="text-gray-400 text-sm">
                  If an account exists for {email}, we've sent you a login link.
                </p>
              </div>
              <Button
                onClick={() => {
                  setSent(false);
                  setEmail('');
                }}
                variant="outline"
                className="border-gray-700 text-white"
              >
                Send another link
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}