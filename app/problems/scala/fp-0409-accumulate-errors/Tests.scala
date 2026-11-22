@main def tests(): Unit =
  Judge.check("map2V › 둘 다 Valid")(map2V(Valid(1): Validated[String, Int], Valid(2): Validated[String, Int])(_ + _), Valid(3))
  Judge.check("map2V › 둘 다 Invalid면 오류가 순서대로 이어짐")(map2V(Invalid(List("a", "b")): Validated[String, Int], Invalid(List("c")): Validated[String, Int])(_ + _), Invalid(List("a", "b", "c")))
  Judge.check("mkPerson › 정상")(mkPerson("Ann", 30), Valid(Person("Ann", 30)))
  Judge.check("mkPerson › 이름만 오류")(mkPerson("", 30), Invalid(List("Name is empty.")))
  Judge.check("mkPerson › 둘 다 오류면 둘 다 보고")(mkPerson("", -1), Invalid(List("Name is empty.", "Age is out of range.")))
  Judge.check("traverseV › 모두 성공")(traverseV(List("a", "b"))(mkName), Valid(List("a", "b")))
  Judge.check("traverseV › 빈 리스트")(traverseV(List.empty[String])(mkName), Valid(Nil))
  Judge.check("traverseV › 오류를 모두 순서대로 모음")(traverseV(List("a", "", "b", ""))(mkName), Invalid(List("Name is empty.", "Name is empty.")))
