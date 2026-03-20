module.exports = async function handler(req, res) {
  return res.status(200).json({
    status: "ok",
    service: "musculolab-capi",
    timestamp: new Date().toISOString(),
  });
};
