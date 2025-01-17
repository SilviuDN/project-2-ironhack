// -   /profile (get)
// -   /profile/friends (get)
// -   /profile/notifications (get)
// -   /profile/edit (get, post)
// -   /profile/delete ? (post)
// -   /profile/new-pet
// -   /profile/:pet_id
// -   /profile/:pet_id/edit
// -   /profile/:pet_id/delete

const router = require('express').Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const saltRounds = 10;

const session = require('express-session');
const Pet = require('../models/Pet.model');
const User = require('../models/User.model');
const isLoggedIn = require('../middleware/isLoggedIn');
const loggedUser = require('../utils/loggedUser');
const Address = require('../models/Address.model');

router.get('/', isLoggedIn, (req, res) => {
	const currentUser = req.session.user;
	const isMod = currentUser.role == 'MODERATOR' || currentUser.role == 'ADMIN';

	User.findById(currentUser._id)
		.populate('pets')
		.then((user) => {
			if (!user) res.status(400).redirect('/login');
			res.status(200).render('user', {
				user: loggedUser(user),
				isMod,
			});
		})
		.catch((error) => {
			if (error instanceof mongoose.Error.ValidationError) {
				return res.status(400).render('user', { user: loggedUser(user), isMod, errorMessage: error.message });
			}
			if (error.code === 11000) {
				return res.status(400).render('user', {
					errorMessage: 'The username you chose is already in use.',
				});
			}
			return res.status(500).render('user', { user: loggedUser(user), isMod, errorMessage: error.message });
		});
});

router.get('/new-pet', isLoggedIn, (req, res) => {
	const user = req.session.user;

	res.render('user/new-pet', { user: loggedUser(user) });
});

router.post('/new-pet', isLoggedIn, (req, res) => {
	const user = req.session.user;
	const { name, description, species, age, gender, profile_img } = req.body;
	const { street, postal, number, country, city } = req.body;
	const address = { street, postal, number, country, city };

	if (!name) {
		return res.status(400).render('user/new-pet', { user: loggedUser(user), errorMessage: 'Please provide a name.' });
	}

	Pet.find({ name })
		.then((foundPets) => {
			foundPets.forEach((pet) => {
				if (user.pets.includes(pet._id)) {
					return res.status(400).render('user/new-pet', {
						user: loggedUser(user),
						errorMessage: 'You have already a pet with that name.',
					});
				}
			});
			return Pet.create({ name, description, species, address, age, gender, profile_img });
		})
		.then((pet) => {
			return User.findById(user._id).then((user) => {
				const pets = [...user.pets];
				pets.push(pet._id);
				user.pets.push(pet._id);
				req.session.user = user;
				return User.findByIdAndUpdate(user._id, { pets });
			});
		})
		.then(() => res.redirect('/profile'))
		.catch((error) => {
			if (error instanceof mongoose.Error.ValidationError) {
				return res.status(400).render('user/new-pet', { user: loggedUser(user), errorMessage: error.message });
			}
			if (error.code === 11000) {
				return res.status(400).render('user/new-pet', {
					errorMessage: 'The username you chose is already in use.',
				});
			}
			return res.status(500).render('user/new-pet', { user: loggedUser(user), errorMessage: error.message });
		});
});

// User Profile Edit

router.get('/edit', isLoggedIn, (req, res) => {
	const currentUser = req.session.user;

	res.render('user/edit-user', { user: loggedUser(currentUser) });
});

router.post('/edit', isLoggedIn, (req, res) => {
	const currentUser = req.session.user;
	const { username, email, password } = req.body;

	if (!username) {
		return res.status(400).render('user/edit-user', { user: loggedUser(user), errorMessage: 'Please provide your username.' });
	}

	/*
	if (password.length < 8) {
		return res.status(400).render('auth/signup', {
			errorMessage: 'Your password needs to be at least 8 characters long.',
		});
	}

	  ! This use case is using a regular expression to control for special characters and min length
	
  const regex = /(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}/;

  if (!regex.test(password)) {
	return res.status(400).render("signup", {
	  errorMessage:
		"Password needs to have at least 8 chars and must contain at least one number, one lowercase and one uppercase letter.",
	});
  }
  */

	User.findOne({ username }).then((found) => {
		// If the user is found, send the message username is taken
		if (found && String(found._id) != String(currentUser._id)) {
			return res.status(400).render('user/edit', { user: loggedUser(user), errorMessage: 'Username already taken.' });
		}

		// if user is not found, create a new user - start with hashing the password
		//añadimos password anterior y nueva

		return bcrypt
			.genSalt(saltRounds)
			.then((salt) => bcrypt.hash(password, salt))
			.then((hashedPassword) => {
				// Create a user and save it in the database
				return User.findByIdAndUpdate(currentUser._id, { username, email, password: hashedPassword });
			})
			.then((user) => {
				// Bind the user to the session object
				req.session.user = user;
				res.redirect('/profile');
			})
			.catch((error) => {
				if (error instanceof mongoose.Error.ValidationError) {
					return res.status(400).render('user/', { user: loggedUser(user), errorMessage: error.message });
				}
				if (error.code === 11000) {
					return res.status(400).render('user/', {
						errorMessage: 'The username you chose is already in use.',
					});
				}
				return res.status(500).render('user/', { user: loggedUser(currentUser), errorMessage: error.message });
			});
	});
});

//Delete user

router.get('/delete', isLoggedIn, (req, res) => {
	res.render('user/delete-user');
});

router.post('/delete', isLoggedIn, (req, res) => {
	const currentUser = req.session.user;

	const deletePets = Pet.deleteMany({
		_id: { $in: currentUser.pets },
	});

	const deleteUser = User.findByIdAndDelete(currentUser._id);

	Promise.all([deletePets, deleteUser])

		.then((pets, user) => console.log(pets, user))
		.then(() =>
			req.session.destroy((err) => {
				if (err) {
					return res.status(500).render('user/', { user: loggedUser(user), errorMessage: err.message });
				}

				res.redirect('/');
			})
		);
});

router.get('/:id', isLoggedIn, (req, res) => {
	const currentUser = req.session.user;
	const id = req.params.id;

	User.findById(currentUser._id)
		.then((user) => {
			return Pet.findById(id).then((pet) => {
				if (!user.pets.includes(String(pet._id))) {
					res.status(401).render('user/', { user: loggedUser(user), errorMessage: 'Not authorized for that pet' });
					return;
				}

				res.status(200).render('user/pet-details', { user: loggedUser(user), pet });
			});
		})
		.catch((error) => {
			if (error instanceof mongoose.Error.ValidationError) {
				return res.status(400).render('user/', { user: loggedUser(currentUser), errorMessage: error.message });
			}

			if (error instanceof mongoose.Error.ValidationError) {
				res.status(401).render('user/', { user: loggedUser(currentUser), errorMessage: 'Not authorized for that pet' });
			}

			if (error.code === 11000) {
				return res.status(400).render('user/', {
					user: loggedUser(user),
					errorMessage: 'The username you chose is already in use.',
				});
			}
			return res.status(500).render('user/new-pet', { user: loggedUser(currentUser), errorMessage: error.message });
		});
});

router.get('/:id/edit', isLoggedIn, (req, res) => {
	const user = req.session.user;

	Pet.findById(req.params.id)
		.then((pet) => {
			if (!user.pets.includes(String(pet._id))) {
				res.status(401).render('user/', { user: loggedUser(user), errorMessage: 'Not authorized for that pet' });
				return;
			}

			res.status(200).render('user/edit-pet', { user: loggedUser(user), pet });
		})
		.catch((error) => {
			if (error instanceof mongoose.Error.ValidationError) {
				return res.status(400).render('user/', { user: loggedUser(user), errorMessage: error.message });
			}
			if (error.code === 11000) {
				return res.status(400).render('user/', {
					errorMessage: error.message,
				});
			}
			return res.status(500).render('user/', { user: loggedUser(user), errorMessage: error.message });
		});
});

router.post('/:id/edit', isLoggedIn, (req, res) => {
	const user = req.session.user;

	const { name, description, species, age, gender, profile_img } = req.body;
	const { street, postal, number, country, city } = req.body;
	const address = { street, postal, number, country, city };

	Pet.findById(req.params.id)
		.then((pet) => {
			if (!user.pets.includes(String(pet._id))) {
				res.status(401).render('user/', { user: loggedUser(user), errorMessage: 'Not authorized for that pet' });
				return;
			}

			return Pet.findByIdAndUpdate(req.params.id, { name, description, species, address, age, gender, profile_img });
		})
		.then(() => res.status(200).redirect('/profile'))
		.catch((error) => {
			if (error instanceof mongoose.Error.ValidationError) {
				return res.status(400).render('user/', { user: loggedUser(user), errorMessage: error.message });
			}
			if (error.code === 11000) {
				return res.status(400).render('user/', {
					errorMessage: error.message,
				});
			}
			return res.status(500).render('user/', { user: loggedUser(user), errorMessage: error.message });
		});
});

// Mirar promiseAll
router.post('/:id/delete', isLoggedIn, (req, res) => {
	const currentUser = req.session.user;
	const id = req.params.id;

	User.findById(currentUser._id)
		.then((user) => {
			user.pets.splice(user.pets.indexOf(id), 1);
			req.session.user = user;
			return User.findByIdAndUpdate(user._id, { pets: user.pets });
		})
		.then(() => Pet.findByIdAndDelete(id))
		.then(() => res.status(200).redirect('/profile'))
		.catch((error) => {
			if (error instanceof mongoose.Error.ValidationError) {
				return res.status(400).render('user/', { user: loggedUser(currentUser), errorMessage: error.message });
			}
			if (error.code === 11000) {
				return res.status(400).render('user/', {
					errorMessage: error.message,
				});
			}
			return res.status(500).render('user/', { user: loggedUser(currentUser), errorMessage: error.message });
		});
});

module.exports = router;
