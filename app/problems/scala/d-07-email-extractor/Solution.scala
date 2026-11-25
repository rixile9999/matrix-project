object Email:
  def unapply(s: String): Option[(String, String)] =
    s.split("@", -1) match
      case Array(user, domain) if user.nonEmpty && domain.nonEmpty => Some((user, domain))
      case _ => None
