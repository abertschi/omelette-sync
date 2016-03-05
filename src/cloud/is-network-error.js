var httpOrNetworkError = require('requestretry/strategies').HTTPOrNetworkError;

export default function isNetworkError(error) {
  return isUserRateLimitExeeded(error) || httpOrNetworkError(error);
}

function isUserRateLimitExeeded(error) {
  return error ? error.code == 403 && error.message == 'User Rate Limit Exceeded' : false;
}
