/**
 * Integration Factory
 * Creates the appropriate integration instance based on platform
 */

import { FacebookIntegration } from './facebook';
import { InstagramIntegration } from './instagram';
import { LinkedInIntegration } from './linkedin';
import { WhatsAppIntegration } from './whatsapp';
import { GoogleIntegration } from './google';
import type { BaseIntegration, Platform } from './base';

export function getIntegrationInstance(platform: Platform): BaseIntegration {
  switch (platform) {
    case 'facebook':
      return new FacebookIntegration();
    case 'instagram':
      return new InstagramIntegration();
    case 'linkedin':
      return new LinkedInIntegration();
    case 'whatsapp':
      return new WhatsAppIntegration();
    case 'google':
      return new GoogleIntegration();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}


