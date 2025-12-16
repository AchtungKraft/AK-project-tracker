import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Loader2, AlertCircle } from "lucide-react";

export default function ClientAuth() {
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  useEffect(() => {
    const validateToken = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token');

      if (!token) {
        setError(true);
        return;
      }

      try {
        // Find token (in production, hash the token first)
        const tokens = await base44.entities.ClientPortalLoginToken.filter({
          token_hash: token,
        });

        if (tokens.length === 0) {
          setError(true);
          return;
        }

        const tokenData = tokens[0];

        // Check if expired or used
        if (tokenData.used_at || new Date(tokenData.expires_at) < new Date()) {
          setError(true);
          return;
        }

        // Mark as used
        await base44.entities.ClientPortalLoginToken.update(tokenData.id, {
          used_at: new Date().toISOString(),
        });

        // Create session
        const sessionToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        
        const sessionExpiresAt = new Date();
        sessionExpiresAt.setDate(sessionExpiresAt.getDate() + 30);

        await base44.entities.ClientPortalSession.create({
          client_contact_id: tokenData.client_contact_id,
          session_token_hash: sessionToken,
          expires_at: sessionExpiresAt.toISOString(),
          last_seen_at: new Date().toISOString(),
        });

        // Store session in localStorage
        localStorage.setItem('client_portal_session', sessionToken);
        localStorage.setItem('client_contact_id', tokenData.client_contact_id);

        // Redirect to projects
        navigate(createPageUrl("ClientProjects"));
      } catch (error) {
        console.error('Auth error:', error);
        setError(true);
      }
    };

    validateToken();
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Invalid or Expired Link</h1>
          <p className="text-gray-400 mb-4">This login link is invalid or has expired.</p>
          <a
            href={createPageUrl("ClientLogin")}
            className="text-blue-400 hover:text-blue-300"
          >
            Request a new login link
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-red-600" />
    </div>
  );
}