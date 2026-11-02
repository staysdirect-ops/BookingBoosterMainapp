<?php
// Bookingbooster pass-through on 20i: every request to this site goes to the Supabase function "bb",
// and its answer comes back unchanged. The proxy key below lets the function trust the visitor's host and IP.
$FN  = getenv('BB_FUNCTION_URL') ?: 'https://butpfekggdxafkjmfwmh.supabase.co/functions/v1/bb';
$KEY = '__PROXY_KEY__';

$skip = ['host', 'content-length', 'connection', 'accept-encoding', 'expect', 'transfer-encoding', 'te', 'upgrade', 'keep-alive'];
$out = [];
foreach (getallheaders() as $k => $v) {
  $lk = strtolower($k);
  if (in_array($lk, $skip, true) || strpos($lk, 'x-bb-') === 0) continue;
  $out[] = $k . ': ' . $v;
}
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
$out[] = 'x-bb-proxy: ' . $KEY;
$out[] = 'x-bb-host: ' . ($_SERVER['HTTP_HOST'] ?? '');
$out[] = 'x-bb-ip: ' . ($_SERVER['REMOTE_ADDR'] ?? '');
$out[] = 'x-bb-proto: ' . ($https ? 'https' : 'http');
$out[] = 'Expect:';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$body = file_get_contents('php://input');
$got = [];
$ch = curl_init($FN . ($_SERVER['REQUEST_URI'] ?? '/'));
curl_setopt_array($ch, [
  CURLOPT_CUSTOMREQUEST => $method,
  CURLOPT_HTTPHEADER => $out,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_FOLLOWLOCATION => false,
  CURLOPT_ENCODING => '',
  CURLOPT_CONNECTTIMEOUT => 10,
  CURLOPT_TIMEOUT => 120,
  CURLOPT_HEADERFUNCTION => function ($c, $line) use (&$got) {
    $p = strpos($line, ':');
    if ($p !== false) $got[] = [strtolower(trim(substr($line, 0, $p))), trim(substr($line, $p + 1))];
    elseif (preg_match('#^HTTP/\S+\s+\d+#', $line)) $got = []; // a new response block (after 100 Continue)
    return strlen($line);
  },
]);
if ($method !== 'GET' && $method !== 'HEAD' && $body !== '') curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
if ($method === 'HEAD') curl_setopt($ch, CURLOPT_NOBODY, true);
$res = curl_exec($ch);
if ($res === false) {
  http_response_code(502);
  header('Content-Type: text/html; charset=utf-8');
  echo '<!doctype html><title>Back soon</title><h1>We will be right back.</h1><p>Bookingbooster is not answering for a moment. Please try again in a minute.</p>';
  exit;
}
http_response_code(curl_getinfo($ch, CURLINFO_RESPONSE_CODE));
// Supabase marks every function reply with a sandbox content security policy; it is meant for its own domain, not ours.
$drop = ['content-length', 'content-encoding', 'transfer-encoding', 'connection', 'keep-alive', 'content-type', 'x-bb-type', 'date', 'server', 'vary', 'alt-svc', 'cf-ray', 'cf-cache-status', 'content-security-policy', 'x-served-by'];
$type = null; $plain = null;
foreach ($got as [$k, $v]) {
  if ($k === 'x-bb-type') { $type = $v; continue; }
  if ($k === 'content-type') { $plain = $v; continue; }
  if (in_array($k, $drop, true) || strpos($k, 'sb-') === 0 || strpos($k, 'x-sb-') === 0 || strpos($k, 'cf-') === 0) continue;
  header($k . ': ' . $v, false);
}
if ($type || $plain) header('Content-Type: ' . ($type ?: $plain));
echo $res;
