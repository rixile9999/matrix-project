def domainOf(s: String): String = s match
  case Email(_, domain) => domain
  case _ => "-"

def userOf(s: String): Option[String] = s match
  case Email(user, _) => Some(user)
  case _ => None

@main def tests(): Unit =
  Judge.check("도메인")(domainOf("ann@example.com"), "example.com")
  Judge.check("사용자")(userOf("bob@mail.org"), Some("bob"))
  Judge.check("@ 없음")(domainOf("plain"), "-")
  Judge.check("@ 둘")(userOf("a@b@c"), None)
  Judge.check("사용자 비었음")(userOf("@x.com"), None)
  Judge.check("도메인 비었음")(domainOf("ann@"), "-")
