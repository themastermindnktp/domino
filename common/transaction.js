async function getEventValues(response) {
  let receipt = await (await response).wait();
  return receipt.events.map((event) => event.args);
}

module.exports = {
  getEventValues,
};
