const jwt = require('jsonwebtoken')
const createToken = (usuario) => {
const data = {
    usuario_id: usuario.id,
    usuario_rol:usuario.rol
}
return jwt.sign(data,'clavetoken')


};

module.exports = { createToken };
