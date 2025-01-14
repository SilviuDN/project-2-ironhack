module.exports = (req, res, next) => {
	// checks if the user is logged in when trying to access a specific page
	if (!req.session.user) {
		// req.logged = false;
		return res.redirect('/login');
	}
	req.user = req.session.user;
	// req.logged = true;
	next();
};
