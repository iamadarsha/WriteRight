/**
 * Adapter C — LM Studio (§4.4, §14.3).
 *
 * LM Studio exposes an OpenAI-compatible server on loopback (default
 * `http://localhost:1234`). It is the same abstraction as the generic local
 * endpoint adapter, with LM Studio's default endpoint and label.
 */

import {
  OpenAiCompatibleAdapter,
  type OpenAiCompatibleConfig,
} from './local-endpoint-adapter';

export const LM_STUDIO_DEFAULT_ENDPOINT = 'http://localhost:1234';

export class LmStudioAdapter extends OpenAiCompatibleAdapter {
  constructor(config: OpenAiCompatibleConfig) {
    super('lmstudio', 'LM Studio', config);
  }
}
