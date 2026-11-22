def findUser(id: Int, users: Map[Int, String]): Either[String, String] =
  users.get(id).toRight("없는 사용자: " + id)
