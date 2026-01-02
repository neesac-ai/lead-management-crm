/**
 * Instagram Lead Ads Integration
 * Uses Facebook infrastructure, similar to Facebook integration
 */

import { FacebookIntegration } from './facebook';

export class InstagramIntegration extends FacebookIntegration {
  platform = 'instagram' as const;
  name = 'Instagram Lead Ads';

  // Instagram uses the same infrastructure as Facebook
  // Most methods can be inherited from FacebookIntegration
  // Override only if Instagram-specific behavior is needed
}

