const express = require("express");
const app = express();

const server = require("http").createServer(app);

const io = require("socket.io")(server, { cors: { origin: "*" } });
const sqlite3 = require("sqlite3").verbose();
const session = require("express-session");
const body = require("body-parser");
const db = new sqlite3.Database("./users.db");


function encryption(s) {
	let encript_list = [];
	for (let i = 0; i < s.length; i++) {
		let newVal = s.charCodeAt(i) + 1;
		encript_list.push(String.fromCharCode(newVal));
	}
	return encript_list.join("");
}

function decryption(encript_s) {
	let s = "";

	for (let i = 0; i < encript_s.length; i++) {
		s += String.fromCharCode(encript_s.charCodeAt(i) - 1);
	}
	return s;
}

function isUserInRoom(roomCode, userName, callback){
	db.all("SELECT * FROM user_in_rooms WHERE room_code = ? AND user_name = ?", [roomCode, userName], (err, row) => {
		if (err){
			console.log(err)
			callback(false)
		}else{
			callback(row.length > 0)
		}
	})
}

function addUserToRoom(roomCode, userName, callback){
	db.all("INSERT INTO user_in_rooms (room_code, user_name) VALUES (?, ?)", [roomCode, userName], (err) => {
		if (err){
			console.log(err)
			callback(false)

		}else{
			callback(true)
		}
	})
}

function deleteUserFromRoom(roomCode, userName, callback){
	db.run("DELETE FROM user_in_rooms WHERE room_code = ? AND user_name = ?", [roomCode, userName], (err) => {
		if(err){
			console.log(err)
			callback(false)

		}else{
			callback(true)
		}
	})
}

function isRoomInThere(roomCode){
	return new Promise((resolve, reject) => {
		db.get("SELECT * FROM rooms WHERE room_code = ?", [roomCode], (err, row) => {
			if (err){
				console.log(err)
			}else{
				if (row){
					resolve(true)
				}else{
					resolve(false)
				}
			}
		})
	})
}
async function generateRandomRoomCode() {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&\'()*+,-./:;<=>?@[]^_`{|}~";
	let roomCode = "";
	let rand_index;
	
	while (true){
		for (let i = 0; i < 4; i++) {
			rand_index = Math.floor(Math.random() * letters.length);
			roomCode += letters[rand_index];
		}
	
		const exist = await isRoomInThere(roomCode)
		if (!exist){
			return roomCode;
		}
	
	}
}


app.use(body.json());

app.use(express.static("./views"));
app.use(
	session({
		secret: "rjk3nnskdHFireasSS(#u*dSKDNSKDG",
		resave: false,
		saveUninitialized: true,
	})
);

app.get("/", (req, res) => {
	const name = req.session.name

	if (name){
		res.redirect("/home.html")
	}else{
		res.redirect("/login.html");
	}
});

app.post("/login", (req, res) => {
	const email = req.body.email;
	const password = req.body.password;

	db.get(
		"SELECT * FROM user WHERE email = ? AND password = ?",
		[email, encryption(password)],
		(err, row) => {
			if (err) {
				console.log(err);
			} else if (row != undefined) {
				req.session.userId = row.id
				req.session.name = row.name;
				req.session.email = row.email;
				req.session.password = row.password;

				res.json({ status: "login_success" });
			} else {
				res.json({ status: "login_failed" });
			}
		}
	);
});

app.post("/sign_up", (req, res) => {
	const name = req.body.name;
	const email = req.body.email;
	const password = req.body.password;


	db.get(
		"SELECT * FROM user WHERE name = ? OR email = ?",
		[name, email],
		(err, row) => {
			if (err) {
				res.json({ status: "sign_up_failed" });
				console.log(err);
			} else {
				if (row == undefined) {
					db.run(
						"INSERT INTO user (name, email, password) VALUES (?, ?, ?)",
						[name, email, encryption(password)],
						(err) => {
							if (err) {
								res.json({ status: "sign_up_failed" });
								console.log(err);
							} else {
								res.json({ status: "sign_up_success" });
							}
						}
					);
				}else{
                    res.json({ status: "sign_up_failed" })
                }
			}
		}
	);
});

app.post("/enter_room", (req, res) => {
	const roomCode = req.body.code

	db.all("SELECT * FROM rooms WHERE room_code = ?", [roomCode], (err, row) => {
		if (err){
			console.log(err)
		}else{
			if (row.length == 0){
				res.json({ status:"room_not_found" })
			}else{
				db.run("INSERT INTO user_in_rooms (room_code, user_name) VALUES (?, ?)", [roomCode, req.session.name], (err) => {
					if (err){
						console.log(err)
					}else{
						res.json({ status:`/chatApp.html?roomCode=${roomCode}?user_name=${req.session.name}` })
					}
				})
				
			}
		}
	})

})


app.post("/user_rooms", async (req, res) => {
	const rows = await new Promise((resolve, reject) => {
		db.all("SELECT * FROM rooms WHERE host_id = ?", [req.session.userId], (err, row) => {
			if (err){
				console.log(err)
				reject(err)
			}else{
				resolve(row)
			}
		})

	})

	if (rows == undefined || rows.length == 0){
		res.json({ status: "no_rooms_found" })
	}else{
		let rooms = []

		for (let i = 0; i < rows.length; i++){
			const row = rows[i]

			const members = await new Promise((resolve, reject) => {
				db.get("SELECT COUNT(user_name) AS members FROM user_in_rooms WHERE room_code = ?", [row.room_code], (err, row2) => {
					if (err){
						console.log(err)
						reject(err)
					}else{
						resolve(row2.members)
					}
				})
			})
			
			const room = {
				room_code: row.room_code,
				members: members
			}

			rooms.push(room)
		}

		res.json({ status: rooms })
		
		
	}

})



app.post("/create_room", async (req, res) => {
	const room_code = await generateRandomRoomCode()

	db.run("INSERT INTO rooms (room_code, host_id) VALUES (?, ?)", [room_code, req.session.userId], (err) => {
		if (err){
			res.json({ status: "error" })
			console.log(err)
		}else{
			res.json({ status: `/show_room_code.html?roomCode=${room_code}?user_name=${req.session.name}` })
		}
	})
})


app.post("/delete_room", (req, res) => {
	const roomCodeToDelete = req.body.room_code
	db.run("DELETE FROM rooms WHERE room_code = ?", [roomCodeToDelete], (err) => {
		if (err){
			console.log(err)
			res.json({ status: "error" })
		}else{
			db.run("DELETE FROM user_in_rooms WHERE room_code = ?", [roomCodeToDelete], (err) => {
				if (err){
					console.log(err)
					res.json({ status: "error" })
				}else{
					res.json({ status: "good" })
				}
			})
		}
	})

})

app.get("/logout.html", (req, res) => {
	db.run("DELETE FROM user WHERE name = ?", [req.session.name], (err) => {
		if (err){
			console.log(err)
		}else{
			req.session.destroy((err) => {
				if (err){
					console.log(err)
				}else{
					res.redirect("/")
				}
			})
		}
	})
})


server.listen(5000, () => {
	console.log("Server is Listening on port 5000...");
});


io.on("connection", (socket) => {
	socket.on("join_room", (roomCode, name) => {
		isUserInRoom(roomCode, name, (isUserInRoom) => {
			if (!isUserInRoom){
				addUserToRoom(roomCode, name, (addUserToRoom) => {
					if (addUserToRoom){
						socket.join(roomCode)
						io.to(roomCode).emit("userConnect", name)
					}
				})

			}else{
				socket.join(roomCode)
			}
		})


		socket.on("message", (message, userName, time) => {
			io.to(roomCode).emit("received_message", message, userName, time)
		})

		socket.on("disconnect", () => {
			deleteUserFromRoom(roomCode, name, (deleteUserFromRoom) => {
				if (deleteUserFromRoom){
					io.to(roomCode).emit("user_disconnect", name)
				}
			})
		})
	})
})
