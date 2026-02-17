import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import placesHandler from '../../../src/routes/places/handler.js';

const PLACES_ENV = {
  GOOGLE_PLACES_API_KEY: 'test-api-key',
};

function createRequest(path, origin = 'https://main--aem-productbus-demo--dylandepass.aem.page') {
  return new Request(`http://localhost${path}`, {
    method: 'GET',
    headers: { Origin: origin },
  });
}

describe('routes/places/handler', () => {
  let fetchStub;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  it('rejects disallowed origin', async () => {
    const request = createRequest('/places/autocomplete?input=test', 'https://evil.com');
    await assert.rejects(
      () => placesHandler(request, { env: PLACES_ENV, params: { action: 'autocomplete' } }),
      { status: 403 },
    );
  });

  it('rejects missing API key', async () => {
    const request = createRequest('/places/autocomplete?input=test');
    await assert.rejects(
      () => placesHandler(request, { env: {}, params: { action: 'autocomplete' } }),
      { status: 503 },
    );
  });

  it('rejects unknown action', async () => {
    const request = createRequest('/places/unknown');
    await assert.rejects(
      () => placesHandler(request, { env: PLACES_ENV, params: { action: 'unknown' } }),
      { status: 404 },
    );
  });

  it('proxies autocomplete requests', async () => {
    fetchStub.resolves(new Response('{"predictions":[]}'));
    const request = createRequest('/places/autocomplete?input=123+Main&sessiontoken=tok1');
    const resp = await placesHandler(request, {
      env: PLACES_ENV,
      params: { action: 'autocomplete' },
    });

    assert.equal(resp.status, 200);
    assert(fetchStub.calledOnce);

    const [url] = fetchStub.firstCall.args;
    assert.ok(url.includes('autocomplete/json'));
    assert.ok(url.includes('key=test-api-key'));
    assert.ok(url.includes('input=123+Main'));
    assert.ok(url.includes('sessiontoken=tok1'));
    assert.ok(url.includes('types=address'));
  });

  it('autocomplete rejects missing input', async () => {
    const request = createRequest('/places/autocomplete');
    await assert.rejects(
      () => placesHandler(request, { env: PLACES_ENV, params: { action: 'autocomplete' } }),
      { status: 400 },
    );
  });

  it('autocomplete works without sessiontoken', async () => {
    fetchStub.resolves(new Response('{"predictions":[]}'));
    const request = createRequest('/places/autocomplete?input=test');
    const resp = await placesHandler(request, {
      env: PLACES_ENV,
      params: { action: 'autocomplete' },
    });

    assert.equal(resp.status, 200);
    const [url] = fetchStub.firstCall.args;
    assert.ok(!url.includes('sessiontoken'));
  });

  it('proxies details requests', async () => {
    fetchStub.resolves(new Response('{"result":{}}'));
    const request = createRequest('/places/details?place_id=ChIJ&sessiontoken=tok2');
    const resp = await placesHandler(request, {
      env: PLACES_ENV,
      params: { action: 'details' },
    });

    assert.equal(resp.status, 200);
    assert(fetchStub.calledOnce);

    const [url] = fetchStub.firstCall.args;
    assert.ok(url.includes('details/json'));
    assert.ok(url.includes('key=test-api-key'));
    assert.ok(url.includes('place_id=ChIJ'));
    assert.ok(url.includes('sessiontoken=tok2'));
    assert.ok(url.includes('fields=address_components'));
  });

  it('details rejects missing place_id', async () => {
    const request = createRequest('/places/details');
    await assert.rejects(
      () => placesHandler(request, { env: PLACES_ENV, params: { action: 'details' } }),
      { status: 400 },
    );
  });

  it('details works without sessiontoken', async () => {
    fetchStub.resolves(new Response('{"result":{}}'));
    const request = createRequest('/places/details?place_id=ChIJ');
    const resp = await placesHandler(request, {
      env: PLACES_ENV,
      params: { action: 'details' },
    });

    assert.equal(resp.status, 200);
    const [url] = fetchStub.firstCall.args;
    assert.ok(!url.includes('sessiontoken'));
  });

  it('accepts Referer header when Origin is absent', async () => {
    fetchStub.resolves(new Response('{"predictions":[]}'));
    const request = new Request('http://localhost/places/autocomplete?input=test', {
      method: 'GET',
      headers: { Referer: 'https://main--aem-productbus-demo--dylandepass.aem.live/page' },
    });
    const resp = await placesHandler(request, {
      env: PLACES_ENV,
      params: { action: 'autocomplete' },
    });

    assert.equal(resp.status, 200);
  });

  it('rejects when both Origin and Referer are missing', async () => {
    const request = new Request('http://localhost/places/autocomplete?input=test', {
      method: 'GET',
    });
    await assert.rejects(
      () => placesHandler(request, { env: PLACES_ENV, params: { action: 'autocomplete' } }),
      { status: 403 },
    );
  });

  it('accepts localhost origin', async () => {
    fetchStub.resolves(new Response('{"predictions":[]}'));
    const request = createRequest('/places/autocomplete?input=test', 'http://localhost:3000');
    const resp = await placesHandler(request, {
      env: PLACES_ENV,
      params: { action: 'autocomplete' },
    });

    assert.equal(resp.status, 200);
  });
});
